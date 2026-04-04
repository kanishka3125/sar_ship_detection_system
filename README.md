#  Zenith – Maritime Intelligence Platform

An AI-powered maritime surveillance system that detects vessels from SAR (Synthetic Aperture Radar) satellite imagery, correlates them with AIS data, and generates real-time intelligence insights.

---

##  Overview

Zenith is designed to assist maritime authorities in identifying suspicious vessels such as:

* 🌑 Dark vessels (AIS turned off)
* 🚫 Zone violations
* ⚠️ High-risk maritime activity

It combines **computer vision + data fusion + interactive visualization** into a single platform.

---

##  System Pipeline

```
SAR Images → YOLOv8 Detection → AIS Matching → Risk Analysis → Alerts → Visualization
```

---

##  Tech Stack

###  Frontend

* React (Vite)
* Leaflet (2D Map)
* React Three Fiber (3D visualization)
* Custom UI (Alerts Panel, Ship Modal, Stats Bar)

###  Backend

* FastAPI (Python)
* YOLOv8 finetuned (Ultralytics)
  Validation results:
  mAP50:    0.871
  mAP50-95: 0.401
* Image processing pipeline

---

##  Features

* 📡 Upload SAR images for analysis
* 🚢 Detect ships using YOLOv8
* 🔍 AIS correlation for vessel identification
* 🚨 Dynamic alert generation
* 🗺️ Interactive 2D map visualization
* 📊 Real-time stats dashboard
* 🧠 Vessel intelligence profiles

---

## 📁 Project Structure

### Frontend

```
src/
 ├── components/
 │   ├── Map2D.jsx
 │   ├── Globe3D.jsx
 │   ├── AlertsPanel.jsx
 │   ├── ShipModal.jsx
 │   ├── StatsBar.jsx
 │   └── SARViewer.jsx
 ├── api.js
 └── App.jsx
```

### Backend

```
app/
 ├── main.py( zenith_combined.py)
 ├── output (pictures)
 ├── test_pictures
 └── models/
     └── last.pt
```

---

##  Getting Started

### 1️ Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/zenith-maritime-intelligence.git
cd zenith-maritime-intelligence
```

---

### 2️ Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```
http://localhost:5173
```

---

### 3️ Backend Setup

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs on:

```
http://localhost:8000
```

---

## 🔗 API Endpoint

### POST `/api/v1/pipeline-multi`

Uploads SAR images and returns vessel intelligence.

#### Example Response:

```json
{
  "vessel_reports": [
    {
      "sar_det_id": 1,
      "sar_coords": { "lat": 13.08, "lon": 80.27 },
      "confidence": 0.79,
      "status": "DARK",
      "ais_match": {
        "name": "Unknown Vessel",
        "speed_kts": 12
      }
    }
  ]
}
```

---

##  Deployment (future)

### Frontend

* Deploy on Vercel or Netlify

### Backend

* Deploy on Render or Railway

### Environment Variable

```
VITE_API_URL=https://your-backend-url
```

---

##  Use Cases

* Coast guard surveillance
* Illegal fishing detection
* Maritime border security
* Anti-smuggling operations

---

##  Highlights

* Real-time AI-powered maritime intelligence
* Works in low-visibility conditions (SAR advantage)
* Combines multiple data sources (SAR + AIS)

---

##  Author

Team Zenith
* Rik Mukherjee
* Hari Pooreni Balaji
* Kanishka Sharma
* Aadhidev M S


---

