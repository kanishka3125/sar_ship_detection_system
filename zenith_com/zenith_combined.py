"""
==============================================================================
 zenith_combined.py  —  Zenith | AI Ship Detection & Intelligence System
 Version: 2.0.0  (Production-Ready, Hackathon Final)

 Combines:
   • YOLOv8 SAR Ship Detection Pipeline
   • AIS Intelligence & Behaviour Analysis Engine
   • FastAPI REST Server  (frontend / backend integration)

 Quick-start:
   pip install ultralytics requests fastapi uvicorn[standard] opencv-python numpy

 Modes:
   # REST API server (connect your React / Leaflet / backend here):
   python zenith_combined.py serve

   # CLI — detection only:
   python zenith_combined.py detect --source path/to/image.jpg

   # CLI — behaviour analysis (offline demo):
   python zenith_combined.py analyse --detections ./output/detections.json --mock

   # CLI — behaviour analysis (live AISHub):
   python zenith_combined.py analyse --detections ./output/detections.json 
       --ais-user YOUR_AISHUB_USERNAME

   # CLI — full pipeline (detect then analyse):
   python zenith_combined.py pipeline --source path/to/image.jpg --mock

 REST Endpoints (when running 'serve' mode):
   GET  /health                     system health and version
   GET  /api/v1/zones               restricted zone definitions (for map overlay)
   POST /api/v1/ais/fetch           fetch live AIS for a bounding box
   POST /api/v1/analyse             run behaviour analysis, returns alert report
   POST /api/v1/detect              upload SAR image, returns detections JSON
   POST /api/v1/pipeline            upload image, detect then analyse in one shot
   GET  /api/v1/alerts              last cached analysis report
   GET  /api/v1/vessels             AIS vessel list from last analysis

 Environment variables (override defaults):
   AISHUB_USERNAME        AISHub API username
   SPOOF_DISTANCE_KM      Spoofing distance threshold  (default: 5.0)
   DARK_RADIUS_KM         Dark-vessel search radius    (default: 25.0)
   LEGIT_RADIUS_KM        Clean-match radius           (default: 2.0)
   YOLO_WEIGHTS           YOLO weights file            (default: yolov8n.pt)
   YOLO_CONF              Detection confidence         (default: 0.5)
   API_PORT               FastAPI port                 (default: 8000)
   API_HOST               FastAPI host                 (default: 0.0.0.0)
   OUTPUT_DIR             Output directory             (default: ./output)
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
from typing import Optional, List, Dict, Any, Tuple

# ── Third-party (always required) ─────────────────────────────────────────────
try:
    import cv2
    import numpy as np
except ImportError:
    sys.exit("[ERROR] OpenCV / NumPy not installed.  Run: pip install opencv-python numpy")

try:
    import requests as _requests
except ImportError:
    sys.exit("[ERROR] requests not installed.  Run: pip install requests")

# ── YOLO (detection mode only — graceful skip if absent) ─────────────────────
try:
    from ultralytics import YOLO
    HAS_YOLO = True
except ImportError:
    HAS_YOLO = False

# ── FastAPI (serve mode only — graceful skip if absent) ──────────────────────
try:
    from fastapi import FastAPI, HTTPException, UploadFile, File, Query
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
    import uvicorn
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level  = logging.INFO,
    format = "%(asctime)s [%(levelname)s] %(message)s",
    datefmt= "%H:%M:%S",
)
log = logging.getLogger("zenith")


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 0 — CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

class Config:
    """
    All tuneable parameters in one place.
    Every value can be overridden via an environment variable before launch.
    """

    # AISHub
    AISHUB_API_URL  : str   = "https://data.aishub.net/ws.php"
    AISHUB_USERNAME : str   = os.getenv("AISHUB_USERNAME", "")

    # ── Three-tier distance classification (km) ────────────────────────────────
    #
    #   dist <= LEGIT_RADIUS_KM                  → LEGITIMATE  (AIS agrees with SAR)
    #   LEGIT_RADIUS_KM < dist <= DARK_RADIUS_KM → SPOOFED     (AIS pos ≠ SAR pos)
    #   dist >  DARK_RADIUS_KM                   → DARK        (no AIS transponder)
    #
    #   FIX (v2): original code had SPOOF_DISTANCE (5km) > DARK_MATCH_RADIUS (2km),
    #   making spoofing detection logically impossible (a vessel had to be within
    #   2km to be matched but >5km away to be flagged as spoofed — mutually
    #   exclusive).  The three-tier model below corrects this permanently.
    #
    LEGIT_RADIUS_KM   : float = float(os.getenv("LEGIT_RADIUS_KM",   "2.0"))
    SPOOF_DISTANCE_KM : float = float(os.getenv("SPOOF_DISTANCE_KM",  "5.0"))
    DARK_RADIUS_KM    : float = float(os.getenv("DARK_RADIUS_KM",    "25.0"))

    # Speed thresholds (knots)
    SPEED_LOITER_KT   : float = float(os.getenv("SPEED_LOITER_KT",  "0.5"))
    SPEED_HIGH_KT     : float = float(os.getenv("SPEED_HIGH_KT",   "25.0"))

    # Course / heading mismatch
    HEADING_DIVERGE_DEG: float = float(os.getenv("HEADING_DIVERGE_DEG", "45.0"))

    # YOLO
    YOLO_WEIGHTS : str   = os.getenv("YOLO_WEIGHTS", "C:/Users/Rik/Downloads/last.pt")
    YOLO_CONF    : float = float(os.getenv("YOLO_CONF", "0.2"))
    YOLO_IOU     : float = float(os.getenv("YOLO_IOU",  "0.5"))

    # API server
    API_HOST    : str = os.getenv("API_HOST",  "0.0.0.0")
    API_PORT    : int = int(os.getenv("API_PORT",  "8000"))
    API_VERSION : str = "2.0.0"

    # I/O
    OUTPUT_DIR  : str = os.getenv("OUTPUT_DIR", "./output")

    # Default geographic bounding box (Arabian Sea)
    DEFAULT_BBOX: Dict[str, float] = {
        "lat_min": 10.0, "lat_max": 15.0,
        "lon_min": 72.0, "lon_max": 77.0,
    }

    # Restricted maritime zones
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


CFG = Config()

# Alert severity constants
SEV_CRITICAL = "CRITICAL"
SEV_HIGH     = "HIGH"
SEV_MEDIUM   = "MEDIUM"
SEV_LOW      = "LOW"
SEV_INFO     = "INFO"
SEVERITY_ORDER = {SEV_CRITICAL: 0, SEV_HIGH: 1, SEV_MEDIUM: 2, SEV_LOW: 3, SEV_INFO: 4}

# Detection drawing
SUPPORTED_IMG_EXT   = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}
BOX_COLOR_NORMAL    = (0, 255,   0)
BOX_COLOR_HIGH_CONF = (0, 200, 255)
LABEL_TEXT_COLOR    = (0,   0,   0)
BOX_THICKNESS       = 2
FONT                = cv2.FONT_HERSHEY_SIMPLEX
FONT_SCALE          = 0.55
FONT_THICKNESS      = 1


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 1 — SHARED UTILITY FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    R    = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a    = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def utc_now() -> str:
    """Current UTC timestamp ISO-8601.  Uses timezone-aware API (Python 3.12-safe)."""
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def api_envelope(
    success: bool,
    data:    Any             = None,
    error:   Optional[str]  = None,
    meta:    Optional[Dict] = None,
) -> Dict:
    """
    Consistent JSON response wrapper for every REST endpoint.

    Frontend can always rely on:
        { "success": bool, "timestamp": str, "data": {...}, "error": str }
    """
    out: Dict[str, Any] = {"success": success, "timestamp": utc_now()}
    if data  is not None: out["data"]  = data
    if error is not None: out["error"] = error
    if meta  is not None: out["meta"]  = meta
    return out


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

    Every alert shares the same schema so the frontend renders them uniformly.
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
    """Write obj as pretty-printed JSON.  Returns absolute path."""
    abs_path = os.path.abspath(path)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)
    return abs_path


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 2 — SAR IMAGE DETECTION (YOLOv8)
# ══════════════════════════════════════════════════════════════════════════════

def load_model(weights: str = CFG.YOLO_WEIGHTS) -> "YOLO":
    if not HAS_YOLO:
        sys.exit("[ERROR] ultralytics not installed.  Run: pip install ultralytics")
    log.info(f"Loading YOLO model: {weights}")
    try:
        model = YOLO(weights)
    except Exception as exc:
        sys.exit(f"[ERROR] Failed to load model '{weights}': {exc}")
    log.info("YOLO model loaded.")
    return model


def preprocess_sar_image(image_path: str) -> Optional[np.ndarray]:
    path = Path(image_path)
    if not path.exists():
        log.error(f"Image not found: {image_path}")
        return None

    img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None:
        log.error(f"OpenCV could not read: {image_path}")
        return None

    # Handle bit depth (e.g., 16-bit SAR)
    if img.dtype != np.uint8:
        img = cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    # 🔥 Ensure proper channel format
    if img.ndim == 2:
        # grayscale → BGR
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    elif img.ndim == 3:
        if img.shape[2] == 1:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        elif img.shape[2] == 4:
            img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
        elif img.shape[2] != 3:
            log.error(f"Unexpected channel format: {img.shape}")
            return None

    else:
        log.error(f"Invalid image shape: {img.shape}")
        return None

    # Resize for YOLO
    img = cv2.resize(img, (640, 640), interpolation=cv2.INTER_AREA)

    # CLAHE (contrast enhancement — important for SAR)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_ch, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    l_clahe = clahe.apply(l_ch)
    img = cv2.cvtColor(cv2.merge([l_clahe, a, b]), cv2.COLOR_LAB2BGR)

    # Denoising (preserve edges)
    img = cv2.bilateralFilter(img, d=5, sigmaColor=40, sigmaSpace=40)

    return img

def run_yolo_inference(
    model:       "YOLO",
    img:         np.ndarray,
    conf_thresh: float = CFG.YOLO_CONF,
    iou_thresh:  float = CFG.YOLO_IOU,
) -> List[Dict]:
    """
    Run YOLOv8 inference. Auto-detects GPU/CPU.
    """

    import torch

    # ✅ Auto device selection
    device = 0 if torch.cuda.is_available() else "cpu"

    results = model.predict(
        source=img,
        conf=conf_thresh,
        iou=iou_thresh,
        verbose=False,
        device=device
    )

    detections: List[Dict] = []
    h, w = img.shape[:2]

    for result in results:
        if result.boxes is None:
            continue

        for box in result.boxes:
            conf = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

            bw, bh = x2 - x1, y2 - y1

            detections.append({
                "class": "ship",
                "confidence": round(conf, 4),
                "bbox": {
                    "x_center": round((x1 + bw / 2) / w, 6),
                    "y_center": round((y1 + bh / 2) / h, 6),
                    "width":    round(bw / w, 6),
                    "height":   round(bh / h, 6),
                },
                "_bbox_pixel": (x1, y1, x2, y2),
            })

    detections.sort(key=lambda d: d["confidence"], reverse=True)
    return detections


def draw_detections(img: np.ndarray, detections: List[Dict]) -> np.ndarray:
    """Annotate image with bounding boxes and confidence labels."""
    out = img.copy()
    for det in detections:
        conf           = det["confidence"]
        x1, y1, x2, y2 = det["_bbox_pixel"]
        color          = BOX_COLOR_HIGH_CONF if conf >= 0.85 else BOX_COLOR_NORMAL
        cv2.rectangle(out, (x1, y1), (x2, y2), color, BOX_THICKNESS)
        label           = f"Ship  {conf:.2f}"
        (tw, th), bl    = cv2.getTextSize(label, FONT, FONT_SCALE, FONT_THICKNESS)
        ly1, ly2        = max(y1 - th - bl - 4, 0), max(y1, th + bl + 4)
        cv2.rectangle(out, (x1, ly1), (x1 + tw + 6, ly2), color, -1)
        cv2.putText(out, label, (x1 + 3, ly2 - bl - 2),
                    FONT, FONT_SCALE, LABEL_TEXT_COLOR, FONT_THICKNESS, cv2.LINE_AA)
    return out


def strip_internal_keys(detections: List[Dict]) -> List[Dict]:
    """Remove '_*' internal keys before serialising detections.json."""
    return [{k: v for k, v in d.items() if not k.startswith("_")} for d in detections]


def resolve_image_sources(source: str) -> List[str]:
    p = Path(source)
    if not p.exists():
        sys.exit(f"[ERROR] Source not found: {source}")
    if p.is_file():
        if p.suffix.lower() not in SUPPORTED_IMG_EXT:
            sys.exit(f"[ERROR] Unsupported format '{p.suffix}'.")
        return [str(p.resolve())]
    if p.is_dir():
        imgs = sorted(str(f.resolve()) for f in p.iterdir()
                      if f.suffix.lower() in SUPPORTED_IMG_EXT)
        if not imgs:
            sys.exit(f"[ERROR] No supported images found in: {source}")
        return imgs
    sys.exit(f"[ERROR] Source is neither a file nor a directory: {source}")


def run_detection_pipeline(args) -> str:
    """Preprocess → YOLO → annotate → save.  Returns path to detections.json."""
    image_paths = resolve_image_sources(args.source)
    model       = load_model(args.weights)

    os.makedirs(args.output, exist_ok=True)
    all_results, failed = [], []

    for img_path in image_paths:
        name = Path(img_path).name
        img  = preprocess_sar_image(img_path)
        if img is None:
            failed.append(name)
            continue

        t0          = time.perf_counter()
        detections  = run_yolo_inference(model, img, args.conf, args.iou)
        elapsed_ms  = (time.perf_counter() - t0) * 1000

        cv2.imwrite(os.path.join(args.output, f"detected_{name}"),
                    draw_detections(img, detections))
        all_results.append({"image": name, "detections": strip_internal_keys(detections)})
        _print_det_summary(name, detections, elapsed_ms)

    json_path = save_json(all_results, os.path.join(args.output, "detections.json"))
    _print_det_final(image_paths, failed, sum(len(r["detections"]) for r in all_results),
                     args.output, json_path)
    return json_path


def _print_det_summary(name: str, dets: List[Dict], ms: float) -> None:
    n   = len(dets)
    sep = "─" * 58
    print(f"\n{sep}\n  Image : {name}    Ships: {n}    ({ms:.1f} ms)\n{sep}")
    if n:
        confs = [d["confidence"] for d in dets]
        print(f"  Conf  max={max(confs):.3f}  min={min(confs):.3f}  avg={np.mean(confs):.3f}")
    else:
        print("  No ships detected above confidence threshold.")
    print(sep)


def _print_det_final(paths, failed, total, out_dir, json_path):
    sep = "═" * 58
    print(f"\n{sep}\n  ZENITH DETECTION — COMPLETE\n{sep}")
    print(f"  Images : {len(paths)}   Failed: {len(failed)}   Ships: {total}")
    print(f"  Output : {os.path.abspath(out_dir)}")
    print(f"  JSON   : {json_path}")
    print(sep)
    for f in failed:
        print(f"  [WARN] Could not process: {f}")
    print("\n  ➡  Pass detections.json to 'analyse' for AIS cross-validation.\n")


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 3 — AIS DATA ACQUISITION
# ══════════════════════════════════════════════════════════════════════════════

def fetch_live_ais(
    username:  str,
    lat_min: float, lat_max: float,
    lon_min: float, lon_max: float,
    timeout_s: int = 15,
) -> List[Dict]:
    """
    Fetch live AIS positions from AISHub.
    Register free at: https://www.aishub.net/
    """
    if not username:
        log.warning("No AISHub username — cannot fetch live AIS.")
        return []

    params = {
        "username": username, "format": "1", "output": "json", "compress": "0",
        "latmin": lat_min, "latmax": lat_max, "lonmin": lon_min, "lonmax": lon_max,
    }
    log.info(f"Fetching live AIS  bbox=({lat_min},{lat_max},{lon_min},{lon_max}) …")
    try:
        resp    = _requests.get(CFG.AISHUB_API_URL, params=params, timeout=timeout_s)
        resp.raise_for_status()
        data    = resp.json()
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


def generate_mock_ais(bbox, sar_latlon=None):
    import random, datetime
    random.seed(42)

    now = datetime.datetime.now(datetime.timezone.utc)

    def ts(mins):
        return (now - datetime.timedelta(minutes=mins)).strftime("%Y-%m-%dT%H:%M:%SZ")

    def v(mmsi, lat, lon, speed, course, heading, name, stype=70, last_seen=2):
        return {
            "MMSI": mmsi,
            "LATITUDE": lat,
            "LONGITUDE": lon,
            "SPEED": speed,
            "COURSE": course,
            "HEADING": heading,
            "SHIPNAME": name,
            "CALLSIGN": "CALL"+mmsi[-3:],
            "IMO": "IMO"+mmsi[-6:],
            "FLAG": "IN",
            "DESTINATION": "PORT",
            "ETA": "2026-03-30T00:00Z",
            "DRAUGHT": 10,
            "LENGTH": 150,
            "BEAM": 25,
            "SHIPTYPE": stype,
            "STATUS": 0,
            "ROT": 0,
            "LAST_SEEN": ts(last_seen),
        }

    vessels = []

    if sar_latlon:
        lat, lon = sar_latlon[0]
        vessels.append(v("419000001", lat+0.005, lon+0.005, 10, 120, 118, "LEGIT_SHIP"))

    if sar_latlon and len(sar_latlon) > 1:
        lat, lon = sar_latlon[1]
        vessels.append(v("351000002", lat+0.07, lon+0.04, 12, 45, 47, "SPOOFED_SHIP"))

    # AIS GAP
    vessels.append(v("636000003", bbox["lat_min"]+1, bbox["lon_min"]+1, 13, 50, 52, "GAP_SHIP", last_seen=50))

    # RENDEZVOUS
    vessels.append(v("419000004", bbox["lat_min"]+2, bbox["lon_min"]+2, 0.3, 200, 200, "RENDEZ_1", stype=30))
    vessels.append(v("419000005", bbox["lat_min"]+2.002, bbox["lon_min"]+2.002, 0.2, 210, 210, "RENDEZ_2", stype=30))

    return vessels


def normalise_ais_vessel(raw):
    return {
        "mmsi": str(raw.get("MMSI")),
        "name": raw.get("SHIPNAME", "UNKNOWN"),
        "lat": float(raw.get("LATITUDE", 0)),
        "lon": float(raw.get("LONGITUDE", 0)),
        "speed_kts": float(raw.get("SPEED", 0)),
        "course": float(raw.get("COURSE", 0)),
        "heading": float(raw.get("HEADING", 0)),
        "ship_type": int(raw.get("SHIPTYPE", 0)),
        "status": int(raw.get("STATUS", 0)),
        "flag": raw.get("FLAG", ""),
        "imo": raw.get("IMO", ""),
        "callsign": raw.get("CALLSIGN", ""),
        "last_seen": raw.get("LAST_SEEN", ""),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 4 — SAR DETECTION LOADING & COORDINATE MAPPING
# ══════════════════════════════════════════════════════════════════════════════

def load_sar_detections(path: str) -> List[Dict]:
    """
    Load detections.json written by run_detection_pipeline().
    Returns flat list; each record tagged with _image and _det_id.
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

    log.info(f"Loaded {len(flat)} SAR detection(s).")
    return flat


def load_image_geo_meta(meta_path: Optional[str]) -> Dict[str, Dict]:
    """
    Load per-image geographic bounding box metadata.

    Expected image_meta.json format:
        {
          "test.jpg": {"lat_min": 10.0, "lat_max": 15.0,
                       "lon_min": 72.0, "lon_max": 77.0}
        }

    Falls back to CFG.DEFAULT_BBOX for unlisted images.
    """
    if meta_path is None:
        log.warning("No --image-meta provided — using default geographic bounding box.")
        return {"__default__": CFG.DEFAULT_BBOX}

    p = Path(meta_path)
    if not p.exists():
        log.warning(f"image_meta.json not found at {meta_path}. Using default bbox.")
        return {"__default__": CFG.DEFAULT_BBOX}

    with open(p, "r", encoding="utf-8") as f:
        meta = json.load(f)
    log.info(f"Loaded geo-meta for {len(meta)} image(s).")
    return meta


def bbox_to_latlon(detection: Dict, image_meta: Dict) -> Tuple[float, float]:
    """
    Convert YOLO normalised bbox centre → geographic (lat, lon).

    Convention:
        x_center  0→1   maps   lon_min → lon_max   (west → east)
        y_center  0→1   maps   lat_max → lat_min   (north → south, image-space)
    """
    img_name = detection.get("_image", "")
    bbox     = detection.get("bbox",   {})
    meta     = image_meta.get(img_name) or image_meta.get("__default__", CFG.DEFAULT_BBOX)

    lat_min = meta.get("lat_min", CFG.DEFAULT_BBOX["lat_min"])
    lat_max = meta.get("lat_max", CFG.DEFAULT_BBOX["lat_max"])
    lon_min = meta.get("lon_min", CFG.DEFAULT_BBOX["lon_min"])
    lon_max = meta.get("lon_max", CFG.DEFAULT_BBOX["lon_max"])

    lon = lon_min + bbox.get("x_center", 0.5) * (lon_max - lon_min)
    lat = lat_max - bbox.get("y_center", 0.5) * (lat_max - lat_min)
    return round(lat, 6), round(lon, 6)


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 5 — CROSS-VALIDATION & BEHAVIOUR CHECKS
# ══════════════════════════════════════════════════════════════════════════════

def find_nearest_ais(
    sar_lat:  float,
    sar_lon:  float,
    vessels:  List[Dict],
) -> Tuple[Optional[Dict], float]:
    """Return (nearest_vessel, distance_km). Returns (None, inf) if list is empty."""
    if not vessels:
        return None, float("inf")
    nearest = min(vessels, key=lambda v: haversine_km(sar_lat, sar_lon, v["lat"], v["lon"]))
    return nearest, haversine_km(sar_lat, sar_lon, nearest["lat"], nearest["lon"])


def classify_vessel(
    sar_lat:  float,
    sar_lon:  float,
    vessels:  List[Dict],
) -> Tuple[str, Optional[Dict], float]:
    """
    Three-tier classification of an SAR detection against AIS data.

    Returns  (status, nearest_vessel, distance_km)

    status:
        "LEGITIMATE" — AIS agrees with SAR  (dist ≤ LEGIT_RADIUS_KM)
        "SPOOFED"    — AIS vessel exists but position is significantly wrong
                       (LEGIT_RADIUS_KM < dist ≤ DARK_RADIUS_KM)
        "DARK"       — No AIS vessel within DARK_RADIUS_KM

    The three-tier model fixes the original bug in v1 where:
        SPOOF_DISTANCE_KM (5 km) > DARK_MATCH_RADIUS_KM (2 km)
    meant a vessel had to be within 2 km to be matched but >5 km away
    to be flagged as spoofed — mutually exclusive, so spoofing was
    dead code.  Here, the tiers are ordered correctly:
        0 – LEGIT_RADIUS_KM < SPOOF_DISTANCE_KM < DARK_RADIUS_KM
    so all three states are reachable.
    """
    vessel, dist = find_nearest_ais(sar_lat, sar_lon, vessels)

    if vessel is None or dist > CFG.DARK_RADIUS_KM:
        return "DARK", vessel, dist
    if dist > CFG.SPOOF_DISTANCE_KM:
        return "SPOOFED", vessel, dist
    return "LEGITIMATE", vessel, dist


# ── Alert factory functions ───────────────────────────────────────────────────

def alert_dark_vessel(det_id: str, lat: float, lon: float, nearest_km: float) -> Dict:
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
        sar_coords  = {"lat": sar_lat,      "lon": sar_lon},
        ais_coords  = {"lat": vessel["lat"], "lon": vessel["lon"]},
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
    status:    str,        # "DARK" | "SPOOFED" | "LEGITIMATE" | "AIS_ONLY"
) -> List[Dict]:
    """Return one alert per restricted zone that contains (lat, lon)."""
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
    """
    alerts : List[Dict] = []
    speed  = vessel["speed_kts"]
    status = vessel["status"]
    course = vessel["course"]
    hdg    = vessel["heading"]
    mmsi   = vessel["mmsi"]
    name   = vessel["name"]
    coords = {"lat": vessel["lat"], "lon": vessel["lon"]}

    # LOITERING
    if speed < CFG.SPEED_LOITER_KT and status == 0:
        alerts.append(make_alert(
            "LOITERING",
            SEV_MEDIUM,
            f"{mmsi} ({name}) near stationary at {speed} kts",
            vessel_id=mmsi,
            ais_coords=coords
        ))

    # EXCESSIVE SPEED
    if speed > CFG.SPEED_HIGH_KT:
        alerts.append(make_alert(
            "EXCESSIVE_SPEED",
            SEV_HIGH,
            f"{mmsi} ({name}) speed {speed} kts exceeds threshold",
            vessel_id=mmsi,
            ais_coords=coords
        ))

    # COURSE vs HEADING mismatch
    if hdg not in (0, 511):
        diff = abs(course - hdg)
        if diff > 180:
            diff = 360 - diff
        if diff > CFG.HEADING_DIVERGE_DEG:
            alerts.append(make_alert(
                "COURSE_HEADING_MISMATCH",
                SEV_LOW,
                f"{mmsi} mismatch {diff:.1f}°",
                vessel_id=mmsi,
                ais_coords=coords
            ))

    # ✅ ADD THIS (AIS GAP CHECK)
    alerts.extend(check_ais_gap(vessel))

    return alerts

BLACKLIST = {"422031337": "Sanctioned vessel"}

def check_blacklist(vessel):
    if vessel["mmsi"] in BLACKLIST:
        return [make_alert(
            "BLACKLISTED",
            SEV_HIGH,
            f"{vessel['name']} is blacklisted",
            vessel_id=vessel["mmsi"],
            ais_coords={"lat": vessel["lat"], "lon": vessel["lon"]}
        )]
    return []

def check_ais_gap(vessel):
    import datetime
    if not vessel.get("last_seen"):
        return []

    try:
        last = datetime.datetime.strptime(vessel["last_seen"], "%Y-%m-%dT%H:%M:%SZ")
        last = last.replace(tzinfo=datetime.timezone.utc)
        gap = (datetime.datetime.now(datetime.timezone.utc) - last).total_seconds()/60
    except:
        return []

    if gap > 30:
        return [make_alert(
            "AIS_GAP",
            SEV_HIGH,
            f"{vessel['name']} AIS gap {gap:.1f} mins",
            vessel_id=vessel["mmsi"],
            ais_coords={"lat": vessel["lat"], "lon": vessel["lon"]}
        )]
    return []

def check_rendezvous(vessels):
    alerts = []
    for i in range(len(vessels)):
        for j in range(i+1, len(vessels)):
            v1, v2 = vessels[i], vessels[j]
            if v1["speed_kts"] < 2 and v2["speed_kts"] < 2:
                dist = haversine_km(v1["lat"], v1["lon"], v2["lat"], v2["lon"])
                if dist < 0.5:
                    alerts.append(make_alert(
                        "RENDEZVOUS",
                        SEV_HIGH,
                        f"{v1['mmsi']} and {v2['mmsi']} meeting",
                        vessel_id=v1["mmsi"]
                    ))
    return alerts



# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 6 — BEHAVIOUR ANALYSIS ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def run_analysis(
    sar_detections:  List[Dict],
    ais_vessels_raw: List[Dict],
    image_meta:      Dict,
) -> Dict:
    """
    Core analysis engine.

    For each SAR detection:
      1. Convert normalised bbox → lat/lon
      2. Three-tier classify against AIS (DARK / SPOOFED / LEGITIMATE)
      3. Run zone violation + behaviour checks
      4. Compile per-vessel report

    AIS vessels not matched to any SAR detection receive an independent
    behaviour / zone pass (deduplication prevents double-counting).

    Returns a complete structured report ready for the frontend map and
    alert dashboard.
    """
    t0   = time.perf_counter()
    norm = [normalise_ais_vessel(v) for v in ais_vessels_raw]

    all_alerts:     List[Dict] = []
    vessel_reports: List[Dict] = []
    matched_mmsi:   set        = set()

    # ── Per SAR detection ─────────────────────────────────────────────────────
    for det in sar_detections:
        det_id            = det["_det_id"]
        sar_lat, sar_lon  = bbox_to_latlon(det, image_meta)
        conf              = det.get("confidence", 0.0)
        det_alerts:  List[Dict] = []

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
            det_alerts.extend(beh);  all_alerts.extend(beh)

        else:   # LEGITIMATE
            matched_mmsi.add(vessel["mmsi"])
            beh = check_behaviour(vessel)
            det_alerts.extend(beh);  all_alerts.extend(beh)

        # Zone checks use SAR coordinates (ground truth)
        vid        = det_id if status == "DARK" else (vessel["mmsi"] if vessel else det_id)
        zone_als   = check_restricted_zones(vid, sar_lat, sar_lon, status)
        det_alerts.extend(zone_als);  all_alerts.extend(zone_als)

        vessel_reports.append({
            "sar_det_id":  det_id,
            "sar_coords":  {"lat": sar_lat, "lon": sar_lon},
            "sar_conf":    conf,
            "status":      status,
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

    # ── Independent AIS pass (deduplicated) ───────────────────────────────────
    for vessel in norm:
        bl = check_blacklist(vessel)
        all_alerts.extend(bl)
        if vessel["mmsi"] in matched_mmsi:
            continue
        beh    = check_behaviour(vessel)
        zon_al = check_restricted_zones(
            vessel["mmsi"],
            vessel["lat"],
            vessel["lon"],
            "AIS_ONLY"
            )
        all_alerts.extend(beh + zon_al)
        # ✅ CORRECT PLACE (outside loop)
    all_alerts.extend(check_rendezvous(norm))

    # ── Summary ───────────────────────────────────────────────────────────────
    elapsed_ms = (time.perf_counter() - t0) * 1000
    sev_counts = {SEV_CRITICAL: 0, SEV_HIGH: 0, SEV_MEDIUM: 0, SEV_LOW: 0, SEV_INFO: 0}
    for al in all_alerts:
        sev_counts[al.get("severity", SEV_INFO)] = (
            sev_counts.get(al.get("severity", SEV_INFO), 0) + 1)

    # Sort: severity first, then timestamp
    all_alerts.sort(key=lambda a: (SEVERITY_ORDER.get(a["severity"], 99), a["timestamp"]))

    return {
        "report_timestamp":    utc_now(),
        "analysis_elapsed_ms": round(elapsed_ms, 1),
        "zenith_version":      CFG.API_VERSION,
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
        "ais_vessels":      norm,               # full list for Leaflet / Mapbox markers
        "restricted_zones": CFG.RESTRICTED_ZONES,
    }


def run_analysis_pipeline(args) -> Dict:
    """CLI wrapper: load → AIS → analyse → save → print."""
    sar_dets   = load_sar_detections(args.detections)
    image_meta = load_image_geo_meta(getattr(args, "image_meta", None))

    bbox = {
        "lat_min": args.lat_min, "lat_max": args.lat_max,
        "lon_min": args.lon_min, "lon_max": args.lon_max,
    }
    sar_coords = [bbox_to_latlon(d, image_meta) for d in sar_dets]

    if args.mock:
        log.info("MOCK mode — generating controlled AIS dataset.")
        ais_raw = generate_mock_ais(bbox, sar_latlon=sar_coords)
    else:
        ais_raw = fetch_live_ais(
            args.ais_user or CFG.AISHUB_USERNAME,
            args.lat_min, args.lat_max, args.lon_min, args.lon_max,
        )
        if not ais_raw:
            log.warning("No AIS data received — all SAR detections will be DARK.")

    report      = run_analysis(sar_dets, ais_raw, image_meta)
    alerts_path = save_json(report, os.path.join(args.output, "alerts.json"))
    log.info(f"alerts.json → {alerts_path}")
    _print_analysis_report(report)
    print(f"  ✔  alerts.json → {alerts_path}\n")
    return report


def _print_analysis_report(report: Dict) -> None:
    s        = report["summary"]
    sev_icon = {SEV_CRITICAL: "🔴", SEV_HIGH: "🟠",
                SEV_MEDIUM: "🟡",  SEV_LOW:  "🔵", SEV_INFO: "⚪"}
    sep      = "═" * 62

    print(f"\n{sep}\n  ZENITH — BEHAVIOUR ANALYSIS REPORT\n{sep}")
    print(f"  Timestamp      : {report['report_timestamp']}")
    print(f"  Analysis time  : {report['analysis_elapsed_ms']:.1f} ms")
    print(f"  SAR detections : {s['total_sar_detections']}")
    print(f"  AIS vessels    : {s['total_ais_vessels']}")
    print(f"  ├─ DARK        : {s['dark_vessels']}")
    print(f"  ├─ SPOOFED     : {s['spoofed_vessels']}")
    print(f"  └─ LEGITIMATE  : {s['legitimate_vessels']}")
    print(f"  Total alerts   : {s['total_alerts']}")
    print()
    for sev in [SEV_CRITICAL, SEV_HIGH, SEV_MEDIUM, SEV_LOW, SEV_INFO]:
        n = s["alerts_by_severity"].get(sev, 0)
        if n:
            print(f"  {sev_icon[sev]} {sev:<10}: {n}")
    print(sep)
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
    if not report["all_alerts"]:
        print("  No anomalies detected. All vessels appear nominal.")
    print(f"\n{sep}\n")


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 7 — FASTAPI REST SERVER
#  Install: pip install fastapi uvicorn[standard]
# ══════════════════════════════════════════════════════════════════════════════

# In-memory cache shared across API requests
_state: Dict[str, Any] = {
    "last_report": None,
    "last_ais":    [],
    "last_dets":   [],
}


def _build_app() -> "FastAPI":
    if not HAS_FASTAPI:
        raise RuntimeError("FastAPI not installed.  Run: pip install fastapi uvicorn[standard]")

    app = FastAPI(
        title       = "Zenith — Maritime Intelligence API",
        description = (
            "AIS cross-validation, dark-vessel detection, spoofing alerts, "
            "and restricted zone monitoring.  "
            "Connect your React / Leaflet frontend to POST /api/v1/pipeline "
            "and GET /api/v1/alerts."
        ),
        version  = CFG.API_VERSION,
        docs_url = "/docs",
        redoc_url= "/redoc",
    )

    # CORS — allow all origins in development (tighten for production)
    app.add_middleware(
        CORSMiddleware,
        allow_origins     = ["*"],
        allow_credentials = True,
        allow_methods     = ["*"],
        allow_headers     = ["*"],
    )

    # ── Pydantic models ───────────────────────────────────────────────────────

    class BboxModel(BaseModel):
        lat_min: float = Field(CFG.DEFAULT_BBOX["lat_min"])
        lat_max: float = Field(CFG.DEFAULT_BBOX["lat_max"])
        lon_min: float = Field(CFG.DEFAULT_BBOX["lon_min"])
        lon_max: float = Field(CFG.DEFAULT_BBOX["lon_max"])

    class AnalyseRequest(BaseModel):
        detections:  List[Dict]                   = Field(...,
            description="SAR detection records from YOLO pipeline")
        bbox:        BboxModel                    = Field(default_factory=BboxModel)
        ais_user:    Optional[str]                = Field(None,
            description="AISHub username (required for live mode)")
        mock:        bool                         = Field(True,
            description="True = use mock AIS data; False = fetch live from AISHub")
        image_meta:  Optional[Dict[str, Dict]]    = Field(None,
            description="Per-image geographic bounding boxes; omit to use bbox for all")

    class AisFetchRequest(BaseModel):
        username: str
        bbox:     BboxModel = Field(default_factory=BboxModel)

    # ── Helper ────────────────────────────────────────────────────────────────

    def _tag_detections(raw_dets: List[Dict]) -> List[Dict]:
        """Attach internal _image and _det_id fields expected by the analysis engine."""
        out = []
        for i, d in enumerate(raw_dets):
            det = dict(d)
            img = det.get("image", "upload")
            det.setdefault("_image",  img)
            det.setdefault("_det_id", f"{img}__det{i:03d}")
            out.append(det)
        return out

    # ── Endpoints ─────────────────────────────────────────────────────────────

    @app.get("/health", tags=["System"],
             summary="Liveness probe — confirm the service is running")
    def health():
        return api_envelope(True, data={
            "status":         "ok",
            "version":        CFG.API_VERSION,
            "yolo_ready":     HAS_YOLO,
            "last_analysis":  (_state["last_report"]["report_timestamp"]
                               if _state["last_report"] else None),
        })

    @app.get("/api/v1/zones", tags=["Reference Data"],
             summary="Restricted zone definitions for Leaflet / Mapbox polygon overlays")
    def get_zones():
        return api_envelope(True, data={"zones": CFG.RESTRICTED_ZONES})

    @app.post("/api/v1/ais/fetch", tags=["AIS"],
              summary="Fetch live AIS vessel positions from AISHub for a bounding box")
    def fetch_ais(req: AisFetchRequest):
        raw    = fetch_live_ais(req.username,
                                req.bbox.lat_min, req.bbox.lat_max,
                                req.bbox.lon_min, req.bbox.lon_max)
        normed = [normalise_ais_vessel(v) for v in raw]
        _state["last_ais"] = normed
        return api_envelope(True, data={"vessel_count": len(normed), "vessels": normed})

    @app.post("/api/v1/analyse", tags=["Analysis"],
              summary="Run behaviour analysis on YOLO detections + AIS data")
    def analyse(req: AnalyseRequest):
        """
        Supply SAR detections (from /api/v1/detect or your YOLO pipeline).
        Set mock=true for demo / offline mode or provide ais_user for live feed.

        Returns the complete report:
            summary, vessel_reports, all_alerts, ais_vessels, restricted_zones
        """
        dets       = _tag_detections(req.detections)
        bbox       = req.bbox.dict()
        image_meta = req.image_meta or {"__default__": bbox}

        sar_coords = [bbox_to_latlon(d, image_meta) for d in dets]

        ais_raw = (generate_mock_ais(bbox, sar_latlon=sar_coords) if req.mock else
                   fetch_live_ais(req.ais_user or CFG.AISHUB_USERNAME,
                                  req.bbox.lat_min, req.bbox.lat_max,
                                  req.bbox.lon_min, req.bbox.lon_max))

        report = run_analysis(dets, ais_raw, image_meta)
        save_json(report, os.path.join(CFG.OUTPUT_DIR, "alerts.json"))
        _state["last_report"] = report

        return api_envelope(True, data=report,
                            meta={"saved_to": os.path.join(CFG.OUTPUT_DIR, "alerts.json")})

    @app.post("/api/v1/detect", tags=["Detection"],
              summary="Upload a SAR image and run YOLOv8 ship detection")
    async def detect(file: UploadFile = File(...)):
        """
        Requires:  pip install ultralytics
        Accepts:   JPG, PNG, TIF, BMP (SAR imagery)
        Returns:   ship count, detection list, path to annotated image
        """
        if not HAS_YOLO:
            raise HTTPException(501, "ultralytics not installed.  Run: pip install ultralytics")

        os.makedirs(CFG.OUTPUT_DIR, exist_ok=True)
        tmp = os.path.join(CFG.OUTPUT_DIR, f"_upload_{file.filename}")
        with open(tmp, "wb") as fh:
            fh.write(await file.read())

        img = preprocess_sar_image(tmp)
        if img is None:
            raise HTTPException(400, "Could not decode uploaded image.")

        model      = load_model(CFG.YOLO_WEIGHTS)
        detections = run_yolo_inference(model, img, CFG.YOLO_CONF, CFG.YOLO_IOU)
        clean      = strip_internal_keys(detections)

        ann_path = os.path.join(CFG.OUTPUT_DIR, f"detected_{file.filename}")
        cv2.imwrite(ann_path, draw_detections(img, detections))

        result = [{"image": file.filename, "detections": clean}]
        save_json(result, os.path.join(CFG.OUTPUT_DIR, "detections.json"))
        _state["last_dets"] = clean

        return api_envelope(True, data={
            "image":           file.filename,
            "ship_count":      len(clean),
            "detections":      clean,
            "annotated_image": ann_path,
        })

    @app.post("/api/v1/pipeline", tags=["Pipeline"],
              summary="One-shot: upload SAR image → detect → analyse → full alert report")
    async def pipeline(
        file:     UploadFile = File(...),
        mock:     bool       = Query(True,  description="Use mock AIS data"),
        ais_user: str        = Query("",    description="AISHub username"),
        lat_min:  float      = Query(CFG.DEFAULT_BBOX["lat_min"]),
        lat_max:  float      = Query(CFG.DEFAULT_BBOX["lat_max"]),
        lon_min:  float      = Query(CFG.DEFAULT_BBOX["lon_min"]),
        lon_max:  float      = Query(CFG.DEFAULT_BBOX["lon_max"]),
    ):
        """
        Primary endpoint for the frontend 'Run Analysis' button.
        Accepts one SAR image, returns detections + full intelligence report.
        """
        if not HAS_YOLO:
            raise HTTPException(501, "ultralytics not installed.")

        os.makedirs(CFG.OUTPUT_DIR, exist_ok=True)
        tmp = os.path.join(CFG.OUTPUT_DIR, f"_pipeline_{file.filename}")
        with open(tmp, "wb") as fh:
            fh.write(await file.read())

        img = preprocess_sar_image(tmp)
        if img is None:
            raise HTTPException(400, "Could not decode image.")

        model      = load_model(CFG.YOLO_WEIGHTS)
        detections = run_yolo_inference(model, img, CFG.YOLO_CONF, CFG.YOLO_IOU)
        clean      = strip_internal_keys(detections)
        ann_path   = os.path.join(CFG.OUTPUT_DIR, f"detected_{file.filename}")
        cv2.imwrite(ann_path, draw_detections(img, detections))

        bbox       = {"lat_min": lat_min, "lat_max": lat_max,
                      "lon_min": lon_min, "lon_max": lon_max}
        image_meta = {"__default__": bbox}
        dets       = _tag_detections([{**d, "image": file.filename} for d in clean])
        sar_coords = [bbox_to_latlon(d, image_meta) for d in dets]

        ais_raw = (generate_mock_ais(bbox, sar_latlon=sar_coords) if mock else
                   fetch_live_ais(ais_user or CFG.AISHUB_USERNAME,
                                  lat_min, lat_max, lon_min, lon_max))

        report = run_analysis(dets, ais_raw, image_meta)
        save_json(report, os.path.join(CFG.OUTPUT_DIR, "alerts.json"))
        _state["last_report"] = report

        return api_envelope(True, data={
            "detections": {
                "ship_count":      len(clean),
                "annotated_image": ann_path,
                "records":         clean,
            },
            "analysis": report,
        })
    
    
    @app.post("/api/v1/pipeline-multi")
    async def pipeline_multi(files: List[UploadFile] = File(...)):

        region_names = ["mumbai", "kochi", "vizag", "chennai"]

        REGIONS = {
            "mumbai": {"lat_min": 18.5, "lat_max": 19.5, "lon_min": 72.5, "lon_max": 73.5},
            "kochi": {"lat_min": 9.5, "lat_max": 10.5, "lon_min": 75.5, "lon_max": 77.0},
            "vizag": {"lat_min": 16.5, "lat_max": 18.0, "lon_min": 82.0, "lon_max": 84.0},
            "chennai": {"lat_min": 12.5, "lat_max": 13.5, "lon_min": 79.5, "lon_max": 81.0},
        }

        model = load_model(CFG.YOLO_WEIGHTS)

        final_reports = []
        final_alerts = []
        all_ais = []

        for i, file in enumerate(files):

            region = region_names[i]
            bbox = REGIONS[region]

            # save image
            path = os.path.join(CFG.OUTPUT_DIR, f"_multi_{region}.jpg")
            with open(path, "wb") as f:
                f.write(await file.read())

            # preprocess + detect
            img = preprocess_sar_image(path)
            if img is None:
                print(f"[ERROR] Failed to read image: {path}")
                continue
            
            detections = run_yolo_inference(model, img, CFG.YOLO_CONF, CFG.YOLO_IOU)
            print("Detections:", detections)
            clean = strip_internal_keys(detections)

            ann_path = os.path.join(CFG.OUTPUT_DIR, f"detected_multi_{region}.jpg")
            cv2.imwrite(ann_path, draw_detections(img, detections))

            # prepare detections
            dets = [{
                **d,
                "_image": file.filename,
                "_det_id": f"{region}_{j}"
                } for j, d in enumerate(clean)]

            image_meta = {"__default__": bbox}

            # SAR → lat/lon
            sar_coords = [bbox_to_latlon(d, image_meta) for d in dets]

            # AIS simulation
            ais_raw = generate_mock_ais(bbox, sar_latlon=sar_coords)
            norm = [normalise_ais_vessel(v) for v in ais_raw]

            # analysis
            report = run_analysis(dets, ais_raw, image_meta)

            # tag region
            for r in report["vessel_reports"]:
                r["region"] = region

            for a in report["all_alerts"]:
                a["region"] = region

            final_reports.extend(report["vessel_reports"])
            final_alerts.extend(report["all_alerts"])
            all_ais.extend(norm)

        return api_envelope(True, data={
            "vessel_reports": final_reports,
            "all_alerts": final_alerts,
            "ais_vessels": all_ais
        })
    
    @app.post("/api/v1/analyse-location")
    async def analyse_location(lat: float, lon: float):


        if not HAS_YOLO:
            raise HTTPException(501, "ultralytics not installed.")
        
        #Create bounding box around the location
        bbox = {
            "lat_min": lat - 0.5,
            "lat_max": lat + 0.5,
            "lon_min": lon - 0.5,
            "lon_max": lon + 0.5,
        }

        #use any SAR image
        image_path = os.path.join(CFG.OUTPUT_DIR, "_multi_chennai.jpg")
        if not os.path.exists(image_path):
            raise HTTPException(400, "Base SAR image not found. Run pipeline-multi first.")
        img = preprocess_sar_image(image_path)
        if img is None:
            raise HTTPException(400, "Could not decode image.")
        model = load_model(CFG.YOLO_WEIGHTS)
        detections = run_yolo_inference(model, img, CFG.YOLO_CONF, CFG.YOLO_IOU)
        print("Custom location detections:", detections)
        clean = strip_internal_keys(detections)

        #prepare detections
        dets = [{
            **d,
            "_image": "custom_location",
            "_det_id": f"loc_{i}"
            } for i, d in enumerate(clean)]
        
        image_meta = {"__default__": bbox}
        # SAR → lat/lon
        sar_coords = [bbox_to_latlon(d, image_meta) for d in dets]
        # AIS simulation
        ais_raw = generate_mock_ais(bbox, sar_latlon=sar_coords)
        # analysis
        report = run_analysis(dets, ais_raw, image_meta)
        return api_envelope(True, data=report)

    @app.get("/api/v1/alerts", tags=["Alerts"],
             summary="Fetch the last cached analysis report (optionally filtered by severity)")
    def get_alerts(
        severity: Optional[str] = Query(
            None,
            description="Filter: CRITICAL | HIGH | MEDIUM | LOW | INFO",
        )
    ):
        """
        Poll this endpoint from your React dashboard for live alert updates.
        Returns the full report when severity is not specified.
        """
        if not _state["last_report"]:
            raise HTTPException(404,
                "No analysis has been run yet.  "
                "Call POST /api/v1/analyse or POST /api/v1/pipeline first.")

        report = _state["last_report"]
        if severity:
            sev = severity.upper()
            if sev not in SEVERITY_ORDER:
                raise HTTPException(400,
                    f"Invalid severity '{sev}'. "
                    f"Valid values: {list(SEVERITY_ORDER.keys())}")
            filtered = [a for a in report["all_alerts"] if a["severity"] == sev]
            return api_envelope(True, data={
                "filter":      sev,
                "alert_count": len(filtered),
                "alerts":      filtered,
            })

        return api_envelope(True, data=report)

    @app.get("/api/v1/vessels", tags=["AIS"],
             summary="AIS vessel list from last analysis (for Leaflet map markers)")
    def get_vessels():
        if not _state["last_report"]:
            raise HTTPException(404, "No analysis run yet.")
        return api_envelope(True, data={
            "vessels": _state["last_report"].get("ais_vessels", [])
        })

    return app


def serve(host: str = CFG.API_HOST, port: int = CFG.API_PORT) -> None:
    """Start the FastAPI / Uvicorn REST server."""
    if not HAS_FASTAPI:
        sys.exit(
            "[ERROR] FastAPI / Uvicorn not installed.\n"
            "        Run: pip install fastapi uvicorn[standard]"
        )
    app = _build_app()
    banner = f"""
  ╔══════════════════════════════════════════════════════════╗
  ║  ZENITH Maritime Intelligence API  v{CFG.API_VERSION:<18} ║
  ╠══════════════════════════════════════════════════════════╣
  ║  Swagger UI  →  http://{host}:{port}/docs                ║
  ║  Health      →  http://{host}:{port}/health              ║
  ║  Pipeline    →  POST http://{host}:{port}/api/v1/pipeline ║
  ║  Alerts      →  GET  http://{host}:{port}/api/v1/alerts  ║
  ╚══════════════════════════════════════════════════════════╝
"""
    print(banner)
    uvicorn.run(app, host=host, port=port, log_level="info")


# ══════════════════════════════════════════════════════════════════════════════
#  SECTION 8 — CLI ARGUMENT PARSER & MAIN
# ══════════════════════════════════════════════════════════════════════════════

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog            = "zenith_combined.py",
        description     = "Zenith | AI Ship Detection & Intelligence System\n"
                          "Subcommands: serve | detect | analyse | pipeline",
        formatter_class = argparse.RawTextHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # serve
    srv = sub.add_parser("serve", help="Start the FastAPI REST server.")
    srv.add_argument("--host", default=CFG.API_HOST)
    srv.add_argument("--port", default=CFG.API_PORT, type=int)

    # detect
    det = sub.add_parser("detect", help="YOLOv8 SAR ship detection.")
    det.add_argument("--source",  "-s", required=True, help="SAR image or folder.")
    det.add_argument("--output",  "-o", default=CFG.OUTPUT_DIR)
    det.add_argument("--weights", "-w", default=CFG.YOLO_WEIGHTS)
    det.add_argument("--conf",    "-c", type=float, default=CFG.YOLO_CONF)
    det.add_argument("--iou",          type=float, default=CFG.YOLO_IOU)

    # analyse
    ana = sub.add_parser("analyse", help="AIS intelligence & behaviour analysis.")
    ana.add_argument("--detections", "-d", required=True, help="Path to detections.json.")
    ana.add_argument("--image-meta", "-m", default=None,
                     help="Path to image_meta.json (per-image geographic bboxes).")
    ana.add_argument("--ais-user",   "-u", default=None, help="AISHub username.")
    ana.add_argument("--mock",       action="store_true",
                     help="Use controlled mock AIS data (demo / offline).")
    ana.add_argument("--output",     "-o", default=CFG.OUTPUT_DIR)
    ana.add_argument("--lat-min",    type=float, default=CFG.DEFAULT_BBOX["lat_min"])
    ana.add_argument("--lat-max",    type=float, default=CFG.DEFAULT_BBOX["lat_max"])
    ana.add_argument("--lon-min",    type=float, default=CFG.DEFAULT_BBOX["lon_min"])
    ana.add_argument("--lon-max",    type=float, default=CFG.DEFAULT_BBOX["lon_max"])

    # pipeline
    pip = sub.add_parser("pipeline", help="Detect then analyse in one command.")
    pip.add_argument("--source",     "-s", required=True)
    pip.add_argument("--output",     "-o", default=CFG.OUTPUT_DIR)
    pip.add_argument("--weights",    "-w", default=CFG.YOLO_WEIGHTS)
    pip.add_argument("--conf",       "-c", type=float, default=CFG.YOLO_CONF)
    pip.add_argument("--iou",              type=float, default=CFG.YOLO_IOU)
    pip.add_argument("--image-meta", "-m", default=None)
    pip.add_argument("--ais-user",   "-u", default=None)
    pip.add_argument("--mock",       action="store_true")
    pip.add_argument("--lat-min",    type=float, default=CFG.DEFAULT_BBOX["lat_min"])
    pip.add_argument("--lat-max",    type=float, default=CFG.DEFAULT_BBOX["lat_max"])
    pip.add_argument("--lon-min",    type=float, default=CFG.DEFAULT_BBOX["lon_min"])
    pip.add_argument("--lon-max",    type=float, default=CFG.DEFAULT_BBOX["lon_max"])

    return parser


def main() -> None:
    args = build_parser().parse_args()

    if args.command == "serve":
        serve(host=args.host, port=args.port)

    elif args.command == "detect":
        run_detection_pipeline(args)

    elif args.command == "analyse":
        if not args.mock and not (args.ais_user or CFG.AISHUB_USERNAME):
            sys.exit(
                "[ERROR] Provide --ais-user YOUR_USERNAME for live AIS,\n"
                "        or add --mock for demo / offline mode."
            )
        run_analysis_pipeline(args)

    elif args.command == "pipeline":
        json_path       = run_detection_pipeline(args)
        args.detections = json_path
        if not args.mock and not (args.ais_user or CFG.AISHUB_USERNAME):
            log.warning("No --ais-user set — switching to --mock automatically.")
            args.mock = True
        run_analysis_pipeline(args)


# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    main()
