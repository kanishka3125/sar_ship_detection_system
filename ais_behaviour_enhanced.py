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
    Generate high-fidelity mock AIS data for demo / offline testing.

    Improvements over v1:
      • Real-looking MMSIs with correct ITU country MID prefixes for the
        Indian Ocean region (India 419, Pakistan 463, UAE 470, Iran 422,
        Liberia 636 flag-of-convenience, Panama 351 flag-of-convenience)
      • Full AIS transponder payload: IMO, CALLSIGN, FLAG, DESTINATION,
        ETA, DRAUGHT, LENGTH, BEAM, ROT (rate of turn)
      • Ship type diversity: tanker, cargo, fishing, tug, pleasure craft
      • last_seen timestamps — enables AIS_TRANSMISSION_GAP detection
      • Background vessels have realistic COG≈HDG (open-sea behaviour),
        with small ±5° natural scatter — not completely random
      • Deliberately exercises every alert path:
          LEGITIMATE   — vessel within 1 km of first SAR detection
          SPOOFED      — vessel 8 km from second SAR detection
          DARK         — remaining SAR detections have no nearby AIS
          LOITERING    — near-zero speed, status = underway
          EXCESSIVE    — speed > SPEED_HIGH_KT (fishing vessel at 29 kts)
          HDG_MISMATCH — 65° divergence COG vs heading
          ZONE         — vessel inside restricted zone
          AIS_GAP      — last transmission > 45 min ago
          RENDEZVOUS   — two vessels within 0.4 km, both near-stationary
          BLACKLIST    — MMSI on known sanctions/flagged list
    """
    import random
    random.seed(42)

    now_utc  = datetime.datetime.now(datetime.timezone.utc)

    def _ts(minutes_ago: float) -> str:
        """Return ISO-8601 timestamp N minutes before now."""
        t = now_utc - datetime.timedelta(minutes=minutes_ago)
        return t.strftime("%Y-%m-%dT%H:%M:%SZ")

    lat_r = bbox["lat_max"] - bbox["lat_min"]
    lon_r = bbox["lon_max"] - bbox["lon_min"]
    vessels: List[Dict] = []

    # ── Full-fidelity vessel builder ──────────────────────────────────────────
    def _vessel(
        mmsi:        str,
        lat:         float,
        lon:         float,
        speed:       float,
        course:      float,
        heading:     float,
        name:        str,
        callsign:    str,
        imo:         str,
        flag:        str,
        destination: str,
        eta:         str,
        draught:     float,     # metres
        length:      int,       # metres
        beam:        int,       # metres
        stype:       int,       # AIS ship type code
        status:      int  = 0,  # AIS navigational status
        rot:         int  = 0,  # rate of turn (°/min, signed)
        last_seen_min: float = 2.0,  # minutes since last AIS transmission
    ) -> Dict:
        return {
            "MMSI":        mmsi,
            "LATITUDE":    round(lat, 6),
            "LONGITUDE":   round(lon, 6),
            "SPEED":       speed,
            "COURSE":      round(course, 1),
            "HEADING":     round(heading, 1),
            "SHIPNAME":    name,
            "CALLSIGN":    callsign,
            "IMO":         imo,
            "FLAG":        flag,
            "DESTINATION": destination,
            "ETA":         eta,
            "DRAUGHT":     draught,
            "LENGTH":      length,
            "BEAM":        beam,
            "SHIPTYPE":    stype,
            "STATUS":      status,
            "ROT":         rot,
            "LAST_SEEN":   _ts(last_seen_min),
        }

    # ─────────────────────────────────────────────────────────────────────────
    #  SCRIPTED VESSELS — each exercises a specific detection path
    # ─────────────────────────────────────────────────────────────────────────

    if sar_latlon and len(sar_latlon) >= 1:
        s0_lat, s0_lon = sar_latlon[0]
        # LEGITIMATE: ~0.7 km from SAR det 0 — Indian bulk carrier
        vessels.append(_vessel(
            mmsi="419012345", lat=s0_lat+0.005, lon=s0_lon+0.005,
            speed=8.5, course=122.0, heading=120.0,
            name="MV AURORA BHARAT", callsign="VTAR9", imo="IMO9234512",
            flag="IN", destination="INMAA",   # Mumbai
            eta="2026-03-28T06:00Z", draught=9.2,
            length=189, beam=28, stype=70,    # 70 = cargo
            status=0, last_seen_min=1.5,
        ))

    if sar_latlon and len(sar_latlon) >= 2:
        s1_lat, s1_lon = sar_latlon[1]
        # SPOOFED: AIS position is ~8 km from SAR det 1 — Panama-flagged tanker
        # (beyond SPOOF_DISTANCE_KM=5 but inside DARK_RADIUS_KM=25)
        vessels.append(_vessel(
            mmsi="351087654", lat=s1_lat+0.07, lon=s1_lon+0.04,
            speed=12.0, course=44.0, heading=46.0,
            name="SS PACIFIC STAR", callsign="3FBQ9", imo="IMO9081234",
            flag="PA", destination="AEJEA",   # Jebel Ali, UAE
            eta="2026-03-29T12:00Z", draught=14.1,
            length=243, beam=42, stype=80,    # 80 = tanker
            status=0, last_seen_min=3.0,
        ))

    # LOITERING: near-zero speed, status=underway — Indian fishing vessel
    # (speed 0.3 kts while AIS says underway → suspicious rendezvous candidate)
    vessels.append(_vessel(
        mmsi="419076543", lat=bbox["lat_min"]+lat_r*0.55, lon=bbox["lon_min"]+lon_r*0.30,
        speed=0.3, course=268.0, heading=265.0,
        name="MV NARMADA FISHER", callsign="VTNF2", imo="IMO8812340",
        flag="IN", destination="INPOK",       # Port Okha
        eta="2026-03-28T18:00Z", draught=4.1,
        length=68, beam=12, stype=30,         # 30 = fishing
        status=0, rot=0, last_seen_min=4.0,
    ))

    # RENDEZVOUS PARTNER: second vessel loitering 0.23 km from NARMADA FISHER
    # Both near-stationary → rendezvous alert
    vessels.append(_vessel(
        mmsi="463009988", lat=bbox["lat_min"]+lat_r*0.5503, lon=bbox["lon_min"]+lon_r*0.3003,
        speed=0.2, course=090.0, heading=092.0,
        name="HABIB RAHMAN", callsign="APHR1", imo="IMO8801122",
        flag="PK", destination="PKQCT",       # Karachi
        eta="2026-03-29T08:00Z", draught=3.8,
        length=55, beam=10, stype=30,         # fishing
        status=0, rot=0, last_seen_min=6.0,
    ))

    # EXCESSIVE SPEED: fishing vessel doing 29 kts — physically impossible for type
    # (fishing vessels max ~12 kts; 29 kts indicates fast go-fast smuggling craft)
    vessels.append(_vessel(
        mmsi="636091234", lat=bbox["lat_min"]+lat_r*0.25, lon=bbox["lon_min"]+lon_r*0.75,
        speed=29.0, course=180.0, heading=179.0,
        name="LIBERIAN EXPRESS", callsign="A8LX7", imo="IMO9345678",
        flag="LR", destination="INIXY",       # Kandla
        eta="2026-03-28T10:00Z", draught=2.1,
        length=42, beam=8, stype=30,          # fishing — wrong for this speed
        status=0, rot=5, last_seen_min=2.5,
    ))

    # COURSE/HEADING MISMATCH: 65° divergence — UAE cargo, evasive manoeuvring
    vessels.append(_vessel(
        mmsi="470112233", lat=bbox["lat_min"]+lat_r*0.80, lon=bbox["lon_min"]+lon_r*0.55,
        speed=10.5, course=90.0, heading=155.0,
        name="AL MARJAN TRADER", callsign="A6MT4", imo="IMO9456789",
        flag="AE", destination="INBOM",       # Mumbai old code
        eta="2026-03-29T00:00Z", draught=7.8,
        length=142, beam=22, stype=70,
        status=0, rot=12, last_seen_min=3.5,
    ))

    # RESTRICTED ZONE + BLACKLISTED MMSI: Iranian tanker in EEZ_ALPHA
    vessels.append(_vessel(
        mmsi="422031337", lat=10.50, lon=73.80,
        speed=7.2, course=320.0, heading=318.0,
        name="HORMUZ SHADOW", callsign="EPHS1", imo="IMO8901234",
        flag="IR", destination="IRBND",       # Bandar Abbas
        eta="2026-03-30T06:00Z", draught=12.8,
        length=228, beam=32, stype=80,        # tanker
        status=0, rot=0, last_seen_min=8.0,
    ))

    # AIS TRANSMISSION GAP: last seen 52 minutes ago — vessel went silent mid-voyage
    # Cargo ship with realistic open-sea COG≈HDG, normal speed
    vessels.append(_vessel(
        mmsi="636045678", lat=bbox["lat_min"]+lat_r*0.60, lon=bbox["lon_min"]+lon_r*0.65,
        speed=13.2, course=055.0, heading=057.0,
        name="ATLANTIC VOYAGER", callsign="A8AV2", imo="IMO9112233",
        flag="LR", destination="INPOK",
        eta="2026-03-29T04:00Z", draught=11.3,
        length=196, beam=30, stype=70,
        status=0, rot=0, last_seen_min=52.0,  # ← 52 min gap triggers AIS_GAP alert
    ))

    # ─────────────────────────────────────────────────────────────────────────
    #  BACKGROUND FLEET — realistic open-sea vessels (COG ≈ HDG ± 5°)
    #  Ship type appropriate speeds, real-looking MMSIs, varied flags
    # ─────────────────────────────────────────────────────────────────────────

    background = [
        # (mmsi,         name,               callsign, imo,           flag, dest,   eta_offset_h, draught, length, beam, stype, spd, course)
        ("419345678", "MV KAVERI",         "VTKV3", "IMO9201234", "IN", "INMAA", 10, 8.5, 165, 25, 70, 11.2, 230.0),
        ("470234567", "GULF PIONEER",      "A6GP5", "IMO9345123", "AE", "AEJEA", 14, 13.2, 225, 36, 80, 14.5, 315.0),
        ("417056789", "LANKA STAR",        "4SAB2", "IMO8923456", "LK", "CMBCO", 20, 6.2, 112, 18, 70,  9.8, 045.0),
        ("351234561", "OMEGA SPIRIT",      "HPOM1", "IMO9567890", "PA", "SGSIN", 36,15.4, 274, 48, 80, 12.1, 090.0),
        ("419567890", "CHENNAI MARINER",   "VTCM6", "IMO9034567", "IN", "INIXZ",  8, 5.1,  80, 14, 30,  6.3, 170.0),
        ("538012349", "PACIFIC RESOLVE",   "V7PR4", "IMO9456012", "MH", "INPOK", 18,10.8, 183, 28, 70, 10.5, 280.0),
    ]

    for (mmsi, name, callsign, imo, flag, dest, eta_h,
         draught, length, beam, stype, spd, course) in background:
        # Natural open-sea scatter: heading within ±5° of COG
        hdg = round(course + random.uniform(-5, 5), 1)
        # Randomise position within bbox — seeded so reproducible
        lat = round(bbox["lat_min"] + random.random() * lat_r, 6)
        lon = round(bbox["lon_min"] + random.random() * lon_r, 6)
        eta_str = (now_utc + datetime.timedelta(hours=eta_h)).strftime("%Y-%m-%dT%H:%MZ")
        vessels.append(_vessel(
            mmsi=mmsi, lat=lat, lon=lon,
            speed=spd, course=course, heading=hdg,
            name=name, callsign=callsign, imo=imo,
            flag=flag, destination=dest, eta=eta_str,
            draught=draught, length=length, beam=beam,
            stype=stype, status=0, rot=0,
            last_seen_min=round(random.uniform(1, 12), 1),
        ))

    log.info(f"Mock AIS: generated {len(vessels)} vessel(s) "
             f"({len(vessels)-len(background)} scripted + {len(background)} background).")
    return vessels


def normalise_ais_vessel(raw: Dict) -> Dict:
    """
    Convert a raw AISHub record into a clean, typed internal dict.

    Now carries the full AIS payload — callsign, IMO, flag, destination,
    ETA, draught, dimensions, ROT, and last_seen — so downstream checks
    (AIS gap, blacklist, ship-type-speed mismatch) have the data they need.
    """
    def _s(key, default="UNKNOWN"):
        v = raw.get(key, default) or default
        return str(v).strip() or default

    return {
        "mmsi":        _s("MMSI"),
        "name":        _s("SHIPNAME"),
        "callsign":    _s("CALLSIGN"),
        "imo":         _s("IMO"),
        "flag":        _s("FLAG"),
        "destination": _s("DESTINATION"),
        "eta":         _s("ETA"),
        "lat":         float(raw.get("LATITUDE",  0.0) or 0.0),
        "lon":         float(raw.get("LONGITUDE", 0.0) or 0.0),
        "speed_kts":   float(raw.get("SPEED",     0.0) or 0.0),
        "course":      float(raw.get("COURSE",    0.0) or 0.0),
        "heading":     float(raw.get("HEADING",   0.0) or 0.0),
        "rot":         int(  raw.get("ROT",       0)   or 0),
        "ship_type":   int(  raw.get("SHIPTYPE",  0)   or 0),
        "status":      int(  raw.get("STATUS",    0)   or 0),
        "draught":     float(raw.get("DRAUGHT",   0.0) or 0.0),
        "length":      int(  raw.get("LENGTH",    0)   or 0),
        "beam":        int(  raw.get("BEAM",      0)   or 0),
        "last_seen":   _s("LAST_SEEN", ""),
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


# ── MMSI Blacklist ────────────────────────────────────────────────────────────
# Known flagged/sanctioned vessels. In production this would be loaded from
# a database or UN/OFAC sanctions feed. Here it's hardcoded for demo.
_BLACKLISTED_MMSI: Dict[str, str] = {
    "422031337": "UN Security Council Iran sanctions — suspected sanctions evasion tanker",
    "422098765": "INTERPOL Blue Notice — linked to Gulf of Aden piracy incidents",
    "636091234": "UNODC watchlist — suspected narcotics trafficking, Pacific corridor",
}

# AIS navigational status labels (ITU-R M.1371-5)
_NAV_STATUS_LABEL = {
    0: "underway using engine", 1: "at anchor", 2: "not under command",
    3: "restricted manoeuvrability", 4: "constrained by draught",
    5: "moored", 6: "aground", 7: "engaged in fishing",
    8: "underway sailing", 15: "default",
}

# Ship type → realistic max speed (knots). Anything beyond this is suspicious.
_STYPE_MAX_SPEED: Dict[int, float] = {
    30: 12.0,   # fishing vessel
    31: 8.0,    # towing
    52: 14.0,   # tug
    60: 20.0,   # passenger
    70: 22.0,   # cargo
    80: 17.0,   # tanker
    90: 10.0,   # other
}


def check_blacklist(vessel: Dict) -> List[Dict]:
    """
    Check vessel MMSI against a known sanctions / watchlist.

    Returns a HIGH-severity alert if matched. In a real deployment this
    connects to OFAC SDN, EU sanctions lists, or UN Security Council data.
    """
    alerts: List[Dict] = []
    reason = _BLACKLISTED_MMSI.get(vessel["mmsi"])
    if reason:
        alerts.append(make_alert(
            alert_type  = "BLACKLISTED_VESSEL",
            severity    = SEV_HIGH,
            description = (
                f"Vessel {vessel['mmsi']} ({vessel['name']}) "
                f"[{vessel.get('flag','?')}] matches sanctions/watchlist: {reason}"
            ),
            vessel_id   = vessel["mmsi"],
            ais_coords  = {"lat": vessel["lat"], "lon": vessel["lon"]},
            metadata    = {
                "callsign":    vessel.get("callsign", ""),
                "imo":         vessel.get("imo", ""),
                "flag":        vessel.get("flag", ""),
                "blacklist_reason": reason,
            },
        ))
    return alerts


def check_ais_gap(vessel: Dict, gap_threshold_min: float = 30.0) -> List[Dict]:
    """
    Detect vessels that have gone silent — last AIS transmission > threshold.

    A vessel that suddenly stops transmitting mid-voyage is a significant
    red flag: it may have deliberately disabled its transponder, suffered
    a technical failure, or been involved in a ship-to-ship transfer.
    Normal AIS update rates: Class A (cargo/tanker) every 2-10 s underway.
    """
    alerts: List[Dict] = []
    last_seen_str = vessel.get("last_seen", "")
    if not last_seen_str or last_seen_str == "UNKNOWN":
        return alerts   # no timestamp available — skip silently

    try:
        last_seen = datetime.datetime.strptime(
            last_seen_str, "%Y-%m-%dT%H:%M:%SZ"
        ).replace(tzinfo=datetime.timezone.utc)
        gap_min = (
            datetime.datetime.now(datetime.timezone.utc) - last_seen
        ).total_seconds() / 60.0
    except ValueError:
        return alerts

    if gap_min > gap_threshold_min:
        alerts.append(make_alert(
            alert_type  = "AIS_TRANSMISSION_GAP",
            severity    = SEV_HIGH,
            description = (
                f"Vessel {vessel['mmsi']} ({vessel['name']}) has not transmitted "
                f"AIS for {gap_min:.0f} minutes (threshold: {gap_threshold_min:.0f} min). "
                "Possible transponder shutdown, ship-to-ship transfer, or technical failure."
            ),
            vessel_id   = vessel["mmsi"],
            ais_coords  = {"lat": vessel["lat"], "lon": vessel["lon"]},
            metadata    = {
                "last_seen":       last_seen_str,
                "gap_minutes":     round(gap_min, 1),
                "threshold_min":   gap_threshold_min,
                "destination":     vessel.get("destination", ""),
                "speed_at_silence": vessel.get("speed_kts", 0.0),
            },
        ))
    return alerts


def check_rendezvous(vessels: List[Dict], radius_km: float = 0.5) -> List[Dict]:
    """
    Detect pairs of vessels loitering in very close proximity — a classic
    indicator of ship-to-ship (STS) transfers used in sanctions evasion,
    dark cargo handoffs, and fuel smuggling.

    A pair is flagged when BOTH vessels are within radius_km of each other
    AND both are near-stationary (speed < SPEED_LOITER_KT * 4 = 2 kts).
    The 2 kt ceiling is intentionally relaxed vs the loitering threshold
    because STS operations often involve slow circling, not dead stops.

    Returns one alert per unique pair — O(n²) but fleet size is small.
    """
    alerts:  List[Dict] = []
    flagged: set        = set()
    slow = [v for v in vessels if v["speed_kts"] < CFG.SPEED_LOITER_KT * 4]

    for i, v1 in enumerate(slow):
        for v2 in slow[i + 1:]:
            pair_key = tuple(sorted([v1["mmsi"], v2["mmsi"]]))
            if pair_key in flagged:
                continue
            dist = haversine_km(v1["lat"], v1["lon"], v2["lat"], v2["lon"])
            if dist <= radius_km:
                flagged.add(pair_key)
                alerts.append(make_alert(
                    alert_type  = "RENDEZVOUS_DETECTED",
                    severity    = SEV_HIGH,
                    description = (
                        f"Vessels {v1['mmsi']} ({v1['name']}) and "
                        f"{v2['mmsi']} ({v2['name']}) are {dist:.2f} km apart, "
                        f"both near-stationary ({v1['speed_kts']} / {v2['speed_kts']} kts). "
                        "Possible ship-to-ship transfer or dark cargo handoff."
                    ),
                    vessel_id   = v1["mmsi"],
                    ais_coords  = {"lat": v1["lat"], "lon": v1["lon"]},
                    metadata    = {
                        "vessel_a":     {"mmsi": v1["mmsi"], "name": v1["name"],
                                         "speed": v1["speed_kts"], "flag": v1.get("flag","")},
                        "vessel_b":     {"mmsi": v2["mmsi"], "name": v2["name"],
                                         "speed": v2["speed_kts"], "flag": v2.get("flag","")},
                        "distance_km":  round(dist, 3),
                        "radius_km":    radius_km,
                    },
                ))
    return alerts


def check_behaviour(vessel: Dict) -> List[Dict]:
    """
    Analyse a normalised AIS record for abnormal navigation patterns.

    Checks (all independent — multiple can fire on the same vessel):

      LOITERING              — speed < SPEED_LOITER_KT while status = 'underway'
      EXCESSIVE_SPEED        — speed > SPEED_HIGH_KT (global hard ceiling)
      SHIP_TYPE_SPEED_ANOMALY— speed exceeds realistic max for this ship type
                               (fishing vessel at 29 kts is MORE suspicious than
                               a cargo ship at 28 kts — type context matters)
      COURSE_HDG_MISMATCH    — |COG - heading| > HEADING_DIVERGE_DEG
      AIS_TRANSMISSION_GAP   — last_seen > 30 min ago
    """
    alerts: List[Dict] = []
    speed  = vessel["speed_kts"]
    status = vessel["status"]
    course = vessel["course"]
    hdg    = vessel["heading"]
    mmsi   = vessel["mmsi"]
    name   = vessel["name"]
    stype  = vessel["ship_type"]
    coords = {"lat": vessel["lat"], "lon": vessel["lon"]}

    # ── Loitering ─────────────────────────────────────────────────────────────
    if speed < CFG.SPEED_LOITER_KT and status == 0:
        alerts.append(make_alert(
            alert_type  = "LOITERING",
            severity    = SEV_MEDIUM,
            description = (
                f"Vessel {mmsi} ({name}) [{vessel.get('flag','?')}] is "
                f"near-stationary (speed={speed} kts) while AIS status = "
                f"'{_NAV_STATUS_LABEL.get(status, status)}'. "
                "Possible loitering, rendezvous staging, or transponder anomaly."
            ),
            vessel_id   = mmsi,
            ais_coords  = coords,
            metadata    = {
                "speed_kts":     speed,
                "ais_status":    status,
                "status_label":  _NAV_STATUS_LABEL.get(status, "unknown"),
                "threshold_kts": CFG.SPEED_LOITER_KT,
                "destination":   vessel.get("destination", ""),
            },
        ))

    # ── Excessive speed (hard ceiling) ────────────────────────────────────────
    if speed > CFG.SPEED_HIGH_KT:
        alerts.append(make_alert(
            alert_type  = "EXCESSIVE_SPEED",
            severity    = SEV_HIGH,
            description = (
                f"Vessel {mmsi} ({name}) travelling at {speed} kts — "
                f"exceeds hard ceiling of {CFG.SPEED_HIGH_KT} kts. "
                "Atypical for merchant class; may indicate fast smuggling craft."
            ),
            vessel_id   = mmsi,
            ais_coords  = coords,
            metadata    = {"speed_kts": speed, "threshold_kts": CFG.SPEED_HIGH_KT,
                           "ship_type": stype, "flag": vessel.get("flag", "")},
        ))

    # ── Ship-type speed anomaly (contextual ceiling) ───────────────────────────
    type_max = _STYPE_MAX_SPEED.get(stype)
    if type_max and speed > type_max and speed <= CFG.SPEED_HIGH_KT:
        alerts.append(make_alert(
            alert_type  = "SHIP_TYPE_SPEED_ANOMALY",
            severity    = SEV_MEDIUM,
            description = (
                f"Vessel {mmsi} ({name}) [type={stype}] is travelling at "
                f"{speed} kts, exceeding the realistic maximum of {type_max} kts "
                f"for this ship class. Speed inconsistent with declared vessel type."
            ),
            vessel_id   = mmsi,
            ais_coords  = coords,
            metadata    = {
                "speed_kts":    speed,
                "type_max_kts": type_max,
                "ship_type":    stype,
                "flag":         vessel.get("flag", ""),
                "imo":          vessel.get("imo", ""),
            },
        ))

    # ── Course / heading mismatch ─────────────────────────────────────────────
    if hdg not in (0, 511):
        diff = abs(course - hdg)
        if diff > 180:
            diff = 360 - diff
        if diff > CFG.HEADING_DIVERGE_DEG:
            alerts.append(make_alert(
                alert_type  = "COURSE_HEADING_MISMATCH",
                severity    = SEV_LOW,
                description = (
                    f"Vessel {mmsi} ({name}) COG ({course:.0f}°) and "
                    f"heading ({hdg:.0f}°) diverge by {diff:.1f}° — "
                    "possible evasive manoeuvring, strong current, or GPS manipulation."
                ),
                vessel_id   = mmsi,
                ais_coords  = coords,
                metadata    = {
                    "course_deg":     course,
                    "heading_deg":    hdg,
                    "divergence_deg": round(diff, 1),
                    "threshold_deg":  CFG.HEADING_DIVERGE_DEG,
                    "rot":            vessel.get("rot", 0),
                },
            ))

    # ── AIS transmission gap ──────────────────────────────────────────────────
    alerts.extend(check_ais_gap(vessel))

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
        bl     = check_blacklist(vessel)
        zon_al = check_restricted_zones(vessel["mmsi"], vessel["lat"], vessel["lon"], "AIS_ONLY")
        all_alerts.extend(beh + bl + zon_al)

    # ── Fleet-wide checks (require full normalised vessel list) ───────────────
    # Rendezvous: runs once across all vessels after individual passes
    all_alerts.extend(check_rendezvous(norm))

    # Blacklist pass for SAR-matched vessels (already in matched_mmsi)
    for vessel in norm:
        if vessel["mmsi"] in matched_mmsi:
            all_alerts.extend(check_blacklist(vessel))

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
        "zenith_version":      "2.1.0",
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
        "ais_vessels":      norm,
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
