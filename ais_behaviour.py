"""
==============================================================================
 ais_behaviour.py  —  Zenith | AIS Intelligence & Behaviour Analysis Engine
 Member 2: Aadhidev M S

 Responsibilities:
   • Integrate AISHub API to stream live transponder data
   • Cross-validate AIS positions vs SAR-detected vessel coords
   • Flag dark vessels  (SAR detected, no AIS signal)
   • Detect spoofed locations  (AIS coord ≠ SAR coord)
   • Flag restricted zone crossings + abnormal paths

 Deliverable: behaviour analysis module with alert JSON output

 ── Integration contract ──────────────────────────────────────────────────────
   INPUT  ← detections.json   produced by Member 1 (Hari) YOLO pipeline
   OUTPUT → alerts.json       consumed by Member 3 (Rik) FastAPI backend

 ── Standalone usage ─────────────────────────────────────────────────────────
   # offline / demo (mock AIS data):
   python ais_behaviour.py --detections ./output/detections.json --mock

   # live AIS from AISHub (register free at https://www.aishub.net):
   python ais_behaviour.py --detections ./output/detections.json \
       --ais-user YOUR_AISHUB_USERNAME

   # pass per-image geo metadata (optional, improves lat/lon accuracy):
   python ais_behaviour.py --detections ./output/detections.json --mock \
       --image-meta ./output/image_meta.json

 ── Environment variable overrides ───────────────────────────────────────────
   AISHUB_USERNAME        AISHub API username
   LEGIT_RADIUS_KM        Clean-match radius          (default: 2.0 km)
   SPOOF_DISTANCE_KM      Spoofing detection threshold (default: 5.0 km)
   DARK_RADIUS_KM         Dark-vessel search radius   (default: 25.0 km)
   SPEED_LOITER_KT        Loitering speed threshold   (default: 0.5 kts)
   SPEED_HIGH_KT          Excessive speed threshold   (default: 25.0 kts)
   HEADING_DIVERGE_DEG    Course/heading mismatch     (default: 45.0 deg)
   OUTPUT_DIR             Output directory            (default: ./output)
==============================================================================
"""

# ── Standard library ──────────────────────────────────────────────────────────
import os
import sys
import json
import math
import time
import logging
import argparse
import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ── Third-party ───────────────────────────────────────────────────────────────
try:
    import requests as _requests
except ImportError:
    sys.exit("[ERROR] requests not installed. Run: pip install requests")

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s [%(levelname)s] %(message)s",
    datefmt = "%H:%M:%S",
)
log = logging.getLogger("zenith.ais")


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION A — CONFIGURATION
#  All tuneable thresholds live here. Matches Config in zenith_combined.py
#  so the combined file can simply import or inherit these values.
# ══════════════════════════════════════════════════════════════════════════════

class AISConfig:
    """
    Configuration for the AIS Intelligence & Behaviour Analysis module.

    Three-tier distance classification (km):
      dist ≤ LEGIT_RADIUS_KM                   → LEGITIMATE  (AIS agrees with SAR)
      LEGIT_RADIUS_KM < dist ≤ DARK_RADIUS_KM  → SPOOFED     (AIS pos ≠ SAR pos)
      dist > DARK_RADIUS_KM                    → DARK         (no AIS within range)

    This ordering (LEGIT < SPOOF < DARK) ensures all three states are reachable.
    The original v1 code had SPOOF_DISTANCE (5 km) > DARK_MATCH_RADIUS (2 km),
    making spoofing detection dead code — corrected here permanently.
    """

    # ── AISHub ────────────────────────────────────────────────────────────────
    AISHUB_API_URL  : str   = "https://data.aishub.net/ws.php"
    AISHUB_USERNAME : str   = os.getenv("AISHUB_USERNAME", "")

    # ── Distance thresholds (km) ───────────────────────────────────────────────
    LEGIT_RADIUS_KM    : float = float(os.getenv("LEGIT_RADIUS_KM",   "2.0"))
    SPOOF_DISTANCE_KM  : float = float(os.getenv("SPOOF_DISTANCE_KM",  "5.0"))
    DARK_RADIUS_KM     : float = float(os.getenv("DARK_RADIUS_KM",    "25.0"))

    # ── Speed thresholds (knots) ───────────────────────────────────────────────
    SPEED_LOITER_KT    : float = float(os.getenv("SPEED_LOITER_KT",   "0.5"))
    SPEED_HIGH_KT      : float = float(os.getenv("SPEED_HIGH_KT",    "25.0"))

    # ── Course / heading mismatch ─────────────────────────────────────────────
    HEADING_DIVERGE_DEG: float = float(os.getenv("HEADING_DIVERGE_DEG", "45.0"))

    # ── I/O ───────────────────────────────────────────────────────────────────
    OUTPUT_DIR: str = os.getenv("OUTPUT_DIR", "./output")

    # ── Default geographic bounding box (Arabian Sea) ─────────────────────────
    DEFAULT_BBOX: Dict[str, float] = {
        "lat_min": 10.0, "lat_max": 15.0,
        "lon_min": 72.0, "lon_max": 77.0,
    }

    # ── Restricted maritime zones ─────────────────────────────────────────────
    #   Each zone is a geographic bounding box with a severity level.
    #   Add or remove zones here without touching any other code.
    RESTRICTED_ZONES: List[Dict] = [
        {
            "id":          "EEZ_ALPHA",
            "name":        "Exclusive Economic Zone Alpha",
            "lat_min":     10.0, "lat_max": 15.0,
            "lon_min":     72.0, "lon_max": 77.0,
            "severity":    "CRITICAL",
            "description": "Indian EEZ — unauthorised transit prohibited",
        },
        {
            "id":          "PIRACY_CORRIDOR",
            "name":        "Piracy Risk Corridor",
            "lat_min":      5.0, "lat_max": 12.0,
            "lon_min":     43.0, "lon_max": 55.0,
            "severity":    "HIGH",
            "description": "Gulf of Aden — active piracy risk zone",
        },
        {
            "id":          "NAVAL_BRAVO",
            "name":        "Naval Exercise Area Bravo",
            "lat_min":     20.0, "lat_max": 25.0,
            "lon_min":     60.0, "lon_max": 65.0,
            "severity":    "HIGH",
            "description": "Active naval exercise corridor — civilian transit restricted",
        },
    ]


CFG = AISConfig()

# Alert severity constants (shared with combined file)
SEV_CRITICAL = "CRITICAL"
SEV_HIGH     = "HIGH"
SEV_MEDIUM   = "MEDIUM"
SEV_LOW      = "LOW"
SEV_INFO     = "INFO"
SEVERITY_ORDER = {SEV_CRITICAL: 0, SEV_HIGH: 1, SEV_MEDIUM: 2, SEV_LOW: 3, SEV_INFO: 4}


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION B — SHARED UTILITIES
#  Duplicated from zenith_combined.py so this module runs standalone.
#  When merged, these are imported from the combined file instead.
# ══════════════════════════════════════════════════════════════════════════════

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres (Haversine formula)."""
    R    = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a    = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def utc_now() -> str:
    """Current UTC timestamp in ISO-8601 format."""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def make_alert(
    alert_type:  str,
    severity:    str,
    description: str,
    vessel_id:   Optional[str]  = None,
    sar_coords:  Optional[Dict] = None,
    ais_coords:  Optional[Dict] = None,
    metadata:    Optional[Dict] = None,
) -> Dict:
    """
    Build a standardised alert record.

    Every alert shares the same schema so Member 3's backend and
    Member 4's frontend can render them uniformly without parsing logic.
    """
    alert: Dict[str, Any] = {
        "timestamp":   utc_now(),
        "alert_type":  alert_type,
        "severity":    severity,
        "description": description,
        "vessel_id":   vessel_id,
        "sar_coords":  sar_coords,
        "ais_coords":  ais_coords,
    }
    if metadata:
        alert["metadata"] = metadata
    return alert


def save_json(obj: Any, path: str) -> str:
    """Write obj as pretty-printed JSON. Returns the absolute path written."""
    abs_path = os.path.abspath(path)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)
    return abs_path


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 1 — AIS DATA ACQUISITION
#  Fetches live vessel transponder data or generates mock data for testing.
# ══════════════════════════════════════════════════════════════════════════════

def fetch_live_ais(
    username:  str,
    lat_min: float, lat_max: float,
    lon_min: float, lon_max: float,
    timeout_s: int = 15,
) -> List[Dict]:
    """
    Fetch live AIS vessel positions from AISHub for a geographic bounding box.

    Register for a free AISHub account at: https://www.aishub.net/
    The API returns the full vessel record including MMSI, position,
    speed, course, heading, ship type, and navigational status.

    Returns:
        List of raw AISHub vessel dicts (pass to normalise_ais_vessel() before use).
    """
    if not username:
        log.warning("No AISHub username — cannot fetch live AIS. Use --mock for demo mode.")
        return []

    params = {
        "username": username,
        "format":   "1",
        "output":   "json",
        "compress": "0",
        "latmin":   lat_min, "latmax": lat_max,
        "lonmin":   lon_min, "lonmax": lon_max,
    }
    log.info(f"Fetching live AIS  bbox=({lat_min},{lat_max},{lon_min},{lon_max}) …")
    try:
        resp    = _requests.get(CFG.AISHUB_API_URL, params=params, timeout=timeout_s)
        resp.raise_for_status()
        data    = resp.json()
        # AISHub returns [metadata_dict, [vessel, vessel, ...]]
        vessels = (data[1] if isinstance(data, list) and len(data) >= 2
                           and isinstance(data[1], list) else
                   data   if isinstance(data, list) else [])
        log.info(f"AIS feed: {len(vessels)} vessel(s) received.")
        return vessels
    except _requests.RequestException as exc:
        log.warning(f"AISHub request failed: {exc}")
        return []
    except (ValueError, KeyError, IndexError) as exc:
        log.warning(f"AIS parse error: {exc}")
        return []


def generate_mock_ais(
    bbox:       Dict[str, float],
    sar_latlon: Optional[List[Tuple[float, float]]] = None,
) -> List[Dict]:
    """
    Generate controlled mock AIS data for demo / offline testing.

    Deliberately exercises every analysis path so all alert types
    appear in the output during presentations:

      LEGITIMATE  — vessel within 1 km of first SAR detection
      SPOOFED     — vessel 8 km from second SAR detection
                    (between LEGIT_RADIUS and DARK_RADIUS thresholds)
      DARK        — remaining SAR detections have no nearby AIS
      LOITERING   — near-zero speed while AIS status = underway
      EXCESSIVE   — speed > SPEED_HIGH_KT
      HDG_MISMATCH— |course - heading| > HEADING_DIVERGE_DEG
      ZONE        — vessel inside a restricted zone
    """
    import random
    random.seed(42)

    lat_r     = bbox["lat_max"] - bbox["lat_min"]
    lon_r     = bbox["lon_max"] - bbox["lon_min"]
    vessels:  List[Dict] = []
    mmsi_base = 310000000

    def _vessel(offset, lat, lon, speed, course, heading, name, status=0, stype=70):
        return {
            "MMSI":      str(mmsi_base + offset),
            "LATITUDE":  round(lat, 5),
            "LONGITUDE": round(lon, 5),
            "SPEED":     speed,
            "COURSE":    course,
            "HEADING":   heading,
            "SHIPNAME":  name,
            "SHIPTYPE":  stype,
            "STATUS":    status,
        }

    # ── Vessels anchored to SAR detections ───────────────────────────────────

    if sar_latlon and len(sar_latlon) >= 1:
        s0_lat, s0_lon = sar_latlon[0]
        # LEGITIMATE: placed ~0.7 km from first SAR detection (< LEGIT_RADIUS)
        vessels.append(_vessel(
            0, s0_lat + 0.005, s0_lon + 0.005,
            speed=8.5, course=120, heading=118, name="MV AURORA",
        ))

    if sar_latlon and len(sar_latlon) >= 2:
        s1_lat, s1_lon = sar_latlon[1]
        # SPOOFED: placed ~8 km from second SAR detection
        # (beyond SPOOF_DISTANCE but within DARK_RADIUS — triggers spoofing alert)
        vessels.append(_vessel(
            7, s1_lat + 0.07, s1_lon + 0.04,
            speed=12.0, course=45, heading=47, name="SS PACIFIC STAR",
        ))

    # ── Behaviour-specific vessels ────────────────────────────────────────────

    # LOITERING: near-zero speed, AIS status = underway (status=0)
    vessels.append(_vessel(
        14,
        bbox["lat_min"] + lat_r * 0.55,
        bbox["lon_min"] + lon_r * 0.30,
        speed=0.2, course=270, heading=265, name="HONG KONG TRADER", status=0,
    ))

    # EXCESSIVE SPEED: well above merchant vessel norms
    vessels.append(_vessel(
        21,
        bbox["lat_min"] + lat_r * 0.25,
        bbox["lon_min"] + lon_r * 0.75,
        speed=28.0, course=180, heading=182, name="MSC GENESIS",
    ))

    # COURSE / HEADING MISMATCH: 65° divergence between COG and true heading
    vessels.append(_vessel(
        28,
        bbox["lat_min"] + lat_r * 0.80,
        bbox["lon_min"] + lon_r * 0.55,
        speed=10.5, course=90, heading=155, name="EVER GIVEN II",
    ))

    # RESTRICTED ZONE violation: inside EEZ_ALPHA bounding box
    vessels.append(_vessel(
        35, 10.50, 73.80,
        speed=7.2, course=320, heading=318, name="MV ATLAS",
    ))

    # Random background vessels — most will be DARK (no matching SAR detection)
    extras = ["TANKER OLYMPUS", "GHOST RUNNER", "MV NAVIGATOR", "SEAWATCH IV"]
    for i, name in enumerate(extras):
        vessels.append(_vessel(
            42 + i * 7,
            round(bbox["lat_min"] + random.random() * lat_r, 5),
            round(bbox["lon_min"] + random.random() * lon_r, 5),
            speed=round(random.uniform(3, 20), 1),
            course=random.randint(0, 359),
            heading=random.randint(0, 359),
            name=name,
        ))

    log.info(f"Mock AIS: generated {len(vessels)} vessel(s).")
    return vessels


def normalise_ais_vessel(raw: Dict) -> Dict:
    """
    Convert a raw AISHub record into a clean, typed internal dict.

    Handles missing fields gracefully with safe defaults so downstream
    analysis never crashes on incomplete transponder data.
    """
    return {
        "mmsi":      str(raw.get("MMSI",     "UNKNOWN")),
        "name":      ((raw.get("SHIPNAME", "UNKNOWN") or "UNKNOWN").strip() or "UNKNOWN"),
        "lat":       float(raw.get("LATITUDE",  0.0)),
        "lon":       float(raw.get("LONGITUDE", 0.0)),
        "speed_kts": float(raw.get("SPEED",     0.0)),
        "course":    float(raw.get("COURSE",    0.0)),
        "heading":   float(raw.get("HEADING",   0.0)),
        "ship_type": int(  raw.get("SHIPTYPE",  0)),
        "status":    int(  raw.get("STATUS",    0)),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 2 — SAR DETECTION LOADING & COORDINATE MAPPING
#  Loads the JSON output from Member 1's YOLO pipeline and converts
#  normalised bounding box centres into real-world lat/lon coordinates.
# ══════════════════════════════════════════════════════════════════════════════

def load_sar_detections(path: str) -> List[Dict]:
    """
    Load detections.json produced by Member 1's YOLO detection pipeline.

    Flattens the per-image list structure into a single list of detection
    records, each tagged with _image and _det_id for traceability.

    Expected input format (detections.json):
        [
          {
            "image": "sentinel1_scene.jpg",
            "detections": [
              {"class": "ship", "confidence": 0.91,
               "bbox": {"x_center": 0.52, "y_center": 0.31,
                         "width": 0.04, "height": 0.06}}
            ]
          }
        ]
    """
    p = Path(path)
    if not p.exists():
        sys.exit(f"[ERROR] detections.json not found: {path}")
    with open(p, "r", encoding="utf-8") as f:
        data = json.load(f)

    flat: List[Dict] = []
    for entry in data:
        img_name = entry.get("image", "unknown")
        for i, det in enumerate(entry.get("detections", [])):
            det["_image"]  = img_name
            det["_det_id"] = f"{img_name}__det{i:03d}"
            flat.append(det)

    log.info(f"Loaded {len(flat)} SAR detection(s) from {path}.")
    return flat


def load_image_geo_meta(meta_path: Optional[str]) -> Dict[str, Dict]:
    """
    Load per-image geographic bounding box metadata.

    Allows accurate lat/lon conversion when images cover different areas.
    Falls back to CFG.DEFAULT_BBOX if no metadata is provided.

    Expected image_meta.json format:
        {
          "sentinel1_scene.jpg": {
            "lat_min": 10.0, "lat_max": 15.0,
            "lon_min": 72.0, "lon_max": 77.0
          }
        }

    How to generate this file (Member 1 / Hari):
        Store the geographic extent of each SAR tile during preprocessing.
        SNAP and rasterio both expose the bounding box via dataset metadata.
    """
    if meta_path is None:
        log.warning("No --image-meta provided — using default geographic bounding box.")
        return {"__default__": CFG.DEFAULT_BBOX}

    p = Path(meta_path)
    if not p.exists():
        log.warning(f"image_meta.json not found at {meta_path}. Falling back to default bbox.")
        return {"__default__": CFG.DEFAULT_BBOX}

    with open(p, "r", encoding="utf-8") as f:
        meta = json.load(f)
    log.info(f"Loaded geo-meta for {len(meta)} image(s).")
    return meta


def bbox_to_latlon(detection: Dict, image_meta: Dict) -> Tuple[float, float]:
    """
    Convert a YOLO normalised bounding box centre → geographic (lat, lon).

    Convention:
        x_center  0→1  maps  lon_min → lon_max  (west  → east)
        y_center  0→1  maps  lat_max → lat_min  (north → south, image-space)

    This is the bridge between Member 1's pixel-space outputs and
    Member 2's geographic analysis — everything downstream uses these coords.
    """
    img_name = detection.get("_image", "")
    bbox     = detection.get("bbox",   {})
    meta     = image_meta.get(img_name) or image_meta.get("__default__", CFG.DEFAULT_BBOX)

    lat_min  = meta.get("lat_min", CFG.DEFAULT_BBOX["lat_min"])
    lat_max  = meta.get("lat_max", CFG.DEFAULT_BBOX["lat_max"])
    lon_min  = meta.get("lon_min", CFG.DEFAULT_BBOX["lon_min"])
    lon_max  = meta.get("lon_max", CFG.DEFAULT_BBOX["lon_max"])

    lon = lon_min + bbox.get("x_center", 0.5) * (lon_max - lon_min)
    lat = lat_max - bbox.get("y_center", 0.5) * (lat_max - lat_min)
    return round(lat, 6), round(lon, 6)


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 3 — CROSS-VALIDATION & CLASSIFICATION
#  The core of Member 2's work: comparing SAR positions against AIS data
#  to classify each vessel and generate targeted security alerts.
# ══════════════════════════════════════════════════════════════════════════════

def find_nearest_ais(
    sar_lat: float,
    sar_lon: float,
    vessels: List[Dict],
) -> Tuple[Optional[Dict], float]:
    """
    Find the nearest AIS vessel to a given SAR detection coordinate.

    Returns:
        (nearest_vessel_dict, distance_km)
        (None, inf) if the vessel list is empty.
    """
    if not vessels:
        return None, float("inf")
    nearest = min(vessels, key=lambda v: haversine_km(sar_lat, sar_lon, v["lat"], v["lon"]))
    return nearest, haversine_km(sar_lat, sar_lon, nearest["lat"], nearest["lon"])


def classify_vessel(
    sar_lat: float,
    sar_lon: float,
    vessels: List[Dict],
) -> Tuple[str, Optional[Dict], float]:
    """
    Three-tier classification of an SAR detection against the AIS fleet.

    Returns:
        (status, nearest_vessel, distance_km)

    Status values:
        "LEGITIMATE" — AIS position agrees with SAR  (dist ≤ LEGIT_RADIUS_KM)
        "SPOOFED"    — AIS vessel exists but position is significantly wrong
                       (LEGIT_RADIUS_KM < dist ≤ DARK_RADIUS_KM)
        "DARK"       — No AIS vessel within DARK_RADIUS_KM at all

    The three thresholds must always satisfy:
        LEGIT_RADIUS_KM < SPOOF_DISTANCE_KM < DARK_RADIUS_KM   (currently 2 < 5 < 25)

    This ordering ensures all three states are reachable. The original v1 code
    had SPOOF_DISTANCE (5 km) > DARK_MATCH_RADIUS (2 km) — a logical impossibility
    where a vessel had to be within 2 km to be matched but >5 km away to be flagged
    as spoofed. Those two conditions are mutually exclusive. This version fixes it.
    """
    vessel, dist = find_nearest_ais(sar_lat, sar_lon, vessels)

    if vessel is None or dist > CFG.DARK_RADIUS_KM:
        return "DARK", vessel, dist
    if dist > CFG.SPOOF_DISTANCE_KM:
        return "SPOOFED", vessel, dist
    return "LEGITIMATE", vessel, dist


# ── Alert factory functions ───────────────────────────────────────────────────
# Each factory builds a fully-formed alert dict with the standardised schema
# that Member 3's database and Member 4's UI expect.

def alert_dark_vessel(det_id: str, lat: float, lon: float, nearest_km: float) -> Dict:
    """
    Alert: SAR-detected ship with no AIS signal within DARK_RADIUS_KM.

    Indicates the vessel has disabled its transponder — a common technique
    used in smuggling, IUU fishing, and sanctions evasion.
    """
    return make_alert(
        alert_type  = "DARK_VESSEL",
        severity    = SEV_CRITICAL,
        description = (
            f"SAR detection '{det_id}' has no AIS transponder within "
            f"{CFG.DARK_RADIUS_KM} km (nearest AIS: {nearest_km:.1f} km). "
            "Vessel likely disabled AIS — possible smuggling, sanctions "
            "evasion, or illegal fishing."
        ),
        vessel_id   = det_id,
        sar_coords  = {"lat": lat, "lon": lon},
        metadata    = {
            "nearest_ais_km": round(nearest_km, 2),
            "dark_radius_km": CFG.DARK_RADIUS_KM,
        },
    )


def alert_spoofed_vessel(
    vessel: Dict, sar_lat: float, sar_lon: float, dist_km: float,
) -> Dict:
    """
    Alert: AIS-broadcasting vessel whose reported position does not match SAR.

    The vessel is physically visible in SAR imagery at (sar_lat, sar_lon)
    but is broadcasting a different AIS position — a strong indicator of
    GPS/AIS spoofing or deliberate manipulation.
    """
    return make_alert(
        alert_type  = "AIS_SPOOFING",
        severity    = SEV_CRITICAL,
        description = (
            f"Vessel {vessel['mmsi']} ({vessel['name']}) is broadcasting "
            f"an AIS position {dist_km:.1f} km from its SAR-verified position "
            f"(spoofing threshold: {CFG.SPOOF_DISTANCE_KM} km). "
            "Strong indicator of GPS/AIS spoofing."
        ),
        vessel_id   = vessel["mmsi"],
        sar_coords  = {"lat": sar_lat,       "lon": sar_lon},
        ais_coords  = {"lat": vessel["lat"],  "lon": vessel["lon"]},
        metadata    = {
            "ais_name":     vessel["name"],
            "distance_km":  round(dist_km, 2),
            "threshold_km": CFG.SPOOF_DISTANCE_KM,
        },
    )


def check_restricted_zones(
    vessel_id: str,
    lat:       float,
    lon:       float,
    status:    str,   # "DARK" | "SPOOFED" | "LEGITIMATE" | "AIS_ONLY"
) -> List[Dict]:
    """
    Check whether a vessel position falls inside any restricted maritime zone.

    Returns one alert per zone violated. Dark vessels in restricted zones
    are escalated to CRITICAL severity regardless of the zone's base level.
    Uses SAR coordinates (ground truth) rather than self-reported AIS position.
    """
    alerts: List[Dict] = []
    for zone in CFG.RESTRICTED_ZONES:
        if (zone["lat_min"] <= lat <= zone["lat_max"] and
                zone["lon_min"] <= lon <= zone["lon_max"]):
            sev = SEV_CRITICAL if status == "DARK" else zone["severity"]
            alerts.append(make_alert(
                alert_type  = "RESTRICTED_ZONE_VIOLATION",
                severity    = sev,
                description = (
                    f"Vessel {vessel_id} entered restricted zone "
                    f"'{zone['name']}' at ({lat:.4f}°, {lon:.4f}°)."
                    + (" Vessel is DARK (no AIS)." if status == "DARK" else "")
                ),
                vessel_id   = vessel_id,
                sar_coords  = {"lat": lat, "lon": lon},
                metadata    = {
                    "zone_id":   zone["id"],
                    "zone_name": zone["name"],
                    "zone_desc": zone["description"],
                    "is_dark":   status == "DARK",
                },
            ))
    return alerts


def check_behaviour(vessel: Dict) -> List[Dict]:
    """
    Analyse a normalised AIS record for abnormal navigation patterns.

    Three independent checks run on every AIS vessel:

      LOITERING          — speed < SPEED_LOITER_KT while status = 'underway'
                           Suggests a vessel is waiting to rendezvous or is
                           masking its stationary state.

      EXCESSIVE_SPEED    — speed > SPEED_HIGH_KT
                           Cargo and tanker vessels rarely exceed 25 kts;
                           higher speeds can indicate fast craft used in
                           contraband runs.

      COURSE_HDG_MISMATCH— |course_over_ground - true_heading| > HEADING_DIVERGE_DEG
                           A large divergence between where a vessel is heading
                           and where it is actually moving suggests evasive
                           manoeuvring or GPS manipulation.
    """
    alerts: List[Dict] = []
    speed  = vessel["speed_kts"]
    status = vessel["status"]
    course = vessel["course"]
    hdg    = vessel["heading"]
    mmsi   = vessel["mmsi"]
    name   = vessel["name"]
    coords = {"lat": vessel["lat"], "lon": vessel["lon"]}

    # ── Loitering ─────────────────────────────────────────────────────────────
    if speed < CFG.SPEED_LOITER_KT and status == 0:   # status 0 = underway (AIS spec)
        alerts.append(make_alert(
            alert_type  = "LOITERING",
            severity    = SEV_MEDIUM,
            description = (
                f"Vessel {mmsi} ({name}) is near-stationary "
                f"(speed = {speed} kts) while AIS status = 'underway'. "
                "Possible loitering, rendezvous, or transponder anomaly."
            ),
            vessel_id   = mmsi,
            ais_coords  = coords,
            metadata    = {
                "speed_kts":     speed,
                "ais_status":    status,
                "threshold_kts": CFG.SPEED_LOITER_KT,
            },
        ))

    # ── Excessive speed ───────────────────────────────────────────────────────
    if speed > CFG.SPEED_HIGH_KT:
        alerts.append(make_alert(
            alert_type  = "EXCESSIVE_SPEED",
            severity    = SEV_HIGH,
            description = (
                f"Vessel {mmsi} ({name}) travelling at {speed} kts — "
                f"exceeds threshold of {CFG.SPEED_HIGH_KT} kts. "
                "Atypical for cargo / tanker class; may indicate fast smuggling craft."
            ),
            vessel_id   = mmsi,
            ais_coords  = coords,
            metadata    = {"speed_kts": speed, "threshold_kts": CFG.SPEED_HIGH_KT},
        ))

    # ── Course / heading mismatch ─────────────────────────────────────────────
    # AIS spec reserves heading 511 = "not available" — skip those records
    if hdg not in (0, 511):
        diff = abs(course - hdg)
        if diff > 180:
            diff = 360 - diff          # normalise to [0, 180]
        if diff > CFG.HEADING_DIVERGE_DEG:
            alerts.append(make_alert(
                alert_type  = "COURSE_HEADING_MISMATCH",
                severity    = SEV_LOW,
                description = (
                    f"Vessel {mmsi} ({name}) course ({course:.0f}°) and "
                    f"heading ({hdg:.0f}°) diverge by {diff:.1f}° — "
                    "possible evasive manoeuvring or GPS manipulation."
                ),
                vessel_id   = mmsi,
                ais_coords  = coords,
                metadata    = {
                    "course_deg":     course,
                    "heading_deg":    hdg,
                    "divergence_deg": round(diff, 1),
                    "threshold_deg":  CFG.HEADING_DIVERGE_DEG,
                },
            ))

    return alerts


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 4 — BEHAVIOUR ANALYSIS ENGINE
#  Main orchestration function. Takes SAR detections + AIS vessels and
#  returns a complete structured report for the backend / frontend.
# ══════════════════════════════════════════════════════════════════════════════

def run_analysis(
    sar_detections:  List[Dict],
    ais_vessels_raw: List[Dict],
    image_meta:      Dict,
) -> Dict:
    """
    Core analysis engine — the primary output of Member 2's work.

    Algorithm:
      For each SAR detection:
        1. Convert normalised bbox → lat/lon  (via image_meta)
        2. Three-tier classify against AIS    (DARK / SPOOFED / LEGITIMATE)
        3. Run restricted zone checks         (using SAR coords as ground truth)
        4. Run behaviour checks               (on matched AIS vessel)
        5. Compile per-vessel report

      AIS vessels not matched to any SAR detection then receive an
      independent behaviour + zone pass (deduplication via matched_mmsi set).

    Returns:
        A complete structured report dict with:
          - summary:         counts by status and severity
          - vessel_reports:  per-SAR-detection detail
          - all_alerts:      sorted flat list for alert dashboard
          - ais_vessels:     normalised vessel list for Leaflet map markers
          - restricted_zones: zone definitions for map polygon overlays

    This dict is serialised directly to alerts.json and also returned
    as the response body from Member 3's POST /api/v1/analyse endpoint.
    """
    t0   = time.perf_counter()
    norm = [normalise_ais_vessel(v) for v in ais_vessels_raw]

    all_alerts:     List[Dict] = []
    vessel_reports: List[Dict] = []
    matched_mmsi:   set        = set()

    # ── Per-SAR-detection analysis ────────────────────────────────────────────
    for det in sar_detections:
        det_id           = det["_det_id"]
        sar_lat, sar_lon = bbox_to_latlon(det, image_meta)
        conf             = det.get("confidence", 0.0)
        det_alerts: List[Dict] = []

        status, vessel, dist_km = classify_vessel(sar_lat, sar_lon, norm)

        if status == "DARK":
            al = alert_dark_vessel(det_id, sar_lat, sar_lon, dist_km)
            det_alerts.append(al)
            all_alerts.append(al)

        elif status == "SPOOFED":
            al = alert_spoofed_vessel(vessel, sar_lat, sar_lon, dist_km)
            det_alerts.append(al)
            all_alerts.append(al)
            matched_mmsi.add(vessel["mmsi"])
            beh = check_behaviour(vessel)
            det_alerts.extend(beh)
            all_alerts.extend(beh)

        else:  # LEGITIMATE
            matched_mmsi.add(vessel["mmsi"])
            beh = check_behaviour(vessel)
            det_alerts.extend(beh)
            all_alerts.extend(beh)

        # Zone checks always use SAR coords (ground truth, not self-reported AIS)
        vid      = det_id if status == "DARK" else (vessel["mmsi"] if vessel else det_id)
        zone_als = check_restricted_zones(vid, sar_lat, sar_lon, status)
        det_alerts.extend(zone_als)
        all_alerts.extend(zone_als)

        vessel_reports.append({
            "sar_det_id": det_id,
            "sar_coords": {"lat": sar_lat, "lon": sar_lon},
            "sar_conf":   conf,
            "status":     status,
            "ais_match": {
                "mmsi":        vessel["mmsi"]      if vessel else None,
                "name":        vessel["name"]      if vessel else None,
                "lat":         vessel["lat"]       if vessel else None,
                "lon":         vessel["lon"]       if vessel else None,
                "speed_kts":   vessel["speed_kts"] if vessel else None,
                "distance_km": round(dist_km, 2),
            },
            "alert_count": len(det_alerts),
            "alerts":      det_alerts,
        })

    # ── Independent AIS pass (vessels not matched to any SAR detection) ───────
    for vessel in norm:
        if vessel["mmsi"] in matched_mmsi:
            continue
        beh    = check_behaviour(vessel)
        zon_al = check_restricted_zones(vessel["mmsi"], vessel["lat"], vessel["lon"], "AIS_ONLY")
        all_alerts.extend(beh + zon_al)

    # ── Compile summary ───────────────────────────────────────────────────────
    elapsed_ms = (time.perf_counter() - t0) * 1000
    sev_counts = {SEV_CRITICAL: 0, SEV_HIGH: 0, SEV_MEDIUM: 0, SEV_LOW: 0, SEV_INFO: 0}
    for al in all_alerts:
        key = al.get("severity", SEV_INFO)
        sev_counts[key] = sev_counts.get(key, 0) + 1

    # Sort alerts: severity first (CRITICAL first), then timestamp
    all_alerts.sort(key=lambda a: (SEVERITY_ORDER.get(a["severity"], 99), a["timestamp"]))

    return {
        "report_timestamp":    utc_now(),
        "analysis_elapsed_ms": round(elapsed_ms, 1),
        "zenith_version":      "2.0.0",
        "summary": {
            "total_sar_detections": len(sar_detections),
            "total_ais_vessels":    len(norm),
            "dark_vessels":         sum(1 for r in vessel_reports if r["status"] == "DARK"),
            "spoofed_vessels":      sum(1 for r in vessel_reports if r["status"] == "SPOOFED"),
            "legitimate_vessels":   sum(1 for r in vessel_reports if r["status"] == "LEGITIMATE"),
            "ais_only_vessels":     len(norm) - len(matched_mmsi),
            "total_alerts":         len(all_alerts),
            "alerts_by_severity":   sev_counts,
        },
        "vessel_reports":   vessel_reports,
        "all_alerts":       all_alerts,
        "ais_vessels":      norm,                # full vessel list for Leaflet map markers
        "restricted_zones": CFG.RESTRICTED_ZONES,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 5 — CLI RUNNER & PRETTY-PRINT
# ══════════════════════════════════════════════════════════════════════════════

def run_analysis_pipeline(args) -> Dict:
    """
    CLI wrapper: load inputs → fetch/mock AIS → run analysis → save → print.

    This is the entry point when running standalone. When integrated into
    zenith_combined.py, Member 3's FastAPI route calls run_analysis() directly
    with pre-loaded data — this function is not needed in the combined version.
    """
    sar_dets   = load_sar_detections(args.detections)
    image_meta = load_image_geo_meta(getattr(args, "image_meta", None))

    bbox = {
        "lat_min": args.lat_min, "lat_max": args.lat_max,
        "lon_min": args.lon_min, "lon_max": args.lon_max,
    }
    sar_coords = [bbox_to_latlon(d, image_meta) for d in sar_dets]

    if args.mock:
        log.info("MOCK mode — generating controlled AIS dataset for demo.")
        ais_raw = generate_mock_ais(bbox, sar_latlon=sar_coords)
    else:
        ais_raw = fetch_live_ais(
            args.ais_user or CFG.AISHUB_USERNAME,
            args.lat_min, args.lat_max, args.lon_min, args.lon_max,
        )
        if not ais_raw:
            log.warning("No live AIS data received — all SAR detections will be flagged DARK.")

    report      = run_analysis(sar_dets, ais_raw, image_meta)
    os.makedirs(args.output, exist_ok=True)
    alerts_path = save_json(report, os.path.join(args.output, "alerts.json"))

    _print_report(report)
    print(f"  ✔  alerts.json → {alerts_path}\n")
    return report


def _print_report(report: Dict) -> None:
    """Human-readable analysis report for terminal output."""
    s        = report["summary"]
    sev_icon = {
        SEV_CRITICAL: "🔴", SEV_HIGH: "🟠",
        SEV_MEDIUM:   "🟡", SEV_LOW:  "🔵", SEV_INFO: "⚪",
    }
    sep = "═" * 62

    print(f"\n{sep}")
    print(f"  ZENITH — AIS BEHAVIOUR ANALYSIS REPORT")
    print(f"{sep}")
    print(f"  Timestamp      : {report['report_timestamp']}")
    print(f"  Analysis time  : {report['analysis_elapsed_ms']:.1f} ms")
    print(f"  SAR detections : {s['total_sar_detections']}")
    print(f"  AIS vessels    : {s['total_ais_vessels']}")
    print(f"  ├─ DARK        : {s['dark_vessels']}")
    print(f"  ├─ SPOOFED     : {s['spoofed_vessels']}")
    print(f"  └─ LEGITIMATE  : {s['legitimate_vessels']}")
    print(f"  AIS-only       : {s['ais_only_vessels']}")
    print(f"  Total alerts   : {s['total_alerts']}")
    print()
    for sev in [SEV_CRITICAL, SEV_HIGH, SEV_MEDIUM, SEV_LOW, SEV_INFO]:
        n = s["alerts_by_severity"].get(sev, 0)
        if n:
            print(f"  {sev_icon[sev]} {sev:<10}: {n}")
    print(sep)

    if not report["all_alerts"]:
        print("\n  No anomalies detected. All vessels appear nominal.")
    else:
        print("\n  ALERTS (sorted by severity):")
        sep2 = "─" * 62
        for al in report["all_alerts"]:
            print(f"\n  {sep2}")
            print(f"  [{al['severity']}] {al['alert_type']}")
            print(f"  Vessel  : {al.get('vessel_id', 'N/A')}")
            print(f"  Detail  : {al['description']}")
            if al.get("sar_coords"):
                c = al["sar_coords"]
                print(f"  SAR pos : lat={c['lat']}, lon={c['lon']}")
            if al.get("ais_coords"):
                c = al["ais_coords"]
                print(f"  AIS pos : lat={c['lat']}, lon={c['lon']}")
    print(f"\n{sep}\n")


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 6 — CLI ARGUMENT PARSER
# ══════════════════════════════════════════════════════════════════════════════

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog            = "ais_behaviour.py",
        description     = "Zenith | AIS Intelligence & Behaviour Analysis — Member 2 (Aadhidev M S)",
        formatter_class = argparse.RawTextHelpFormatter,
    )

    parser.add_argument(
        "--detections", "-d", required=True,
        help="Path to detections.json (output from Member 1's YOLO pipeline)",
    )
    parser.add_argument(
        "--image-meta", "-m", default=None,
        help=(
            "Path to image_meta.json with per-image geographic bboxes.\n"
            "Generate this from SNAP/rasterio during SAR preprocessing (Member 1).\n"
            "Omit to use the default Arabian Sea bounding box."
        ),
    )
    parser.add_argument(
        "--ais-user", "-u", default=None,
        help="AISHub username for live AIS feed (register free at aishub.net).",
    )
    parser.add_argument(
        "--mock", action="store_true",
        help="Use controlled mock AIS data for demo / offline testing.",
    )
    parser.add_argument(
        "--output", "-o", default=CFG.OUTPUT_DIR,
        help=f"Output directory for alerts.json (default: {CFG.OUTPUT_DIR})",
    )
    # Geographic bounding box overrides
    parser.add_argument("--lat-min", type=float, default=CFG.DEFAULT_BBOX["lat_min"])
    parser.add_argument("--lat-max", type=float, default=CFG.DEFAULT_BBOX["lat_max"])
    parser.add_argument("--lon-min", type=float, default=CFG.DEFAULT_BBOX["lon_min"])
    parser.add_argument("--lon-max", type=float, default=CFG.DEFAULT_BBOX["lon_max"])

    return parser


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    args = build_parser().parse_args()

    if not args.mock and not (args.ais_user or CFG.AISHUB_USERNAME):
        sys.exit(
            "[ERROR] Provide --ais-user YOUR_USERNAME for live AIS,\n"
            "        or pass --mock for demo / offline mode."
        )

    run_analysis_pipeline(args)


if __name__ == "__main__":
    main()
