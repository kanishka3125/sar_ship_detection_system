# Zenith – Maritime Intelligence Platform

An AI-powered maritime surveillance and intelligence system that detects vessels from Synthetic Aperture Radar (SAR) satellite imagery, correlates them with AIS (Automatic Identification System) data, and generates actionable real-time insights.

---

## Overview

Zenith is designed to support maritime monitoring and security operations by enabling the detection and analysis of non-cooperative or high-risk vessels.

The system focuses on identifying:

- 🌑 **Dark vessels** (AIS disabled or absent)  
- 🚫 **Unauthorized zone violations**  
- ⚠️ **Anomalous or high-risk maritime behaviour**

By combining **computer vision, geospatial data fusion, and real-time visualization**, Zenith provides a unified intelligence layer for maritime situational awareness.

---

## Problem Statement

Maritime surveillance systems often rely heavily on AIS data, which can be intentionally disabled, spoofed, or manipulated. This creates critical blind spots in monitoring and enforcement.

Zenith addresses this challenge by integrating:

- **SAR imagery** (detects physical presence of vessels regardless of visibility or AIS status)  
- **AIS data** (provides vessel identity and reported behavior)

This fusion enables reliable identification of discrepancies between **observed reality** and **reported data**.

---

## System Pipeline
SAR Images → YOLOv8 Detection → AIS Correlation → Behaviour Analysis → Risk Classification → Alerts → Visualization


---

## Core Capabilities

### 🛰️ Layer 1 — SAR vs AIS (Identity Verification)

- Detection of vessels from SAR imagery  
- Spatial correlation with AIS signals  
- Classification into:
  - DARK (no AIS match)
  - SPOOFED (mismatch in position/identity)
  - LEGITIMATE (consistent match)

---

### 📡 Layer 2 — Behavioural Intelligence (AIS-based)

Detection of anomalous vessel behaviour including:

- Loitering patterns  
- Excessive or abnormal speed  
- Heading inconsistencies  
- AIS transmission gaps  
- Vessel rendezvous events  
- Restricted zone violations  
- Blacklisted vessel tracking  

---

## Tech Stack

### Frontend

- React (Vite)  
- Leaflet (2D geospatial visualization)  
- React Three Fiber (3D visualization)  
- Custom UI components (Alerts Panel, Ship Modal, Stats Dashboard)

---

### Backend

- FastAPI (Python)  
- YOLOv8 (Ultralytics, fine-tuned)

**Model Performance:**
- mAP50: 0.871  
- mAP50–95: 0.401  

- Image processing and inference pipeline  
- AIS-SAR data fusion logic  

---

## Features

- 📡 SAR image ingestion and processing  
- 🚢 AI-based vessel detection  
- 🔍 AIS correlation for identity verification  
- 🚨 Automated alert generation  
- 🗺️ Interactive geospatial visualization (2D + 3D)  
- 📊 Real-time analytics dashboard  
- 🧠 Vessel intelligence profiling  

---


## System Architecture

### Frontend Structure

src/
├── components/
│ ├── Map2D.jsx
│ ├── Globe3D.jsx
│ ├── AlertsPanel.jsx
│ ├── ShipModal.jsx
│ ├── StatsBar.jsx
│ └── SARViewer.jsx
├── api.js
└── App.jsx

---

### Backend Structure

app/
├── main.py (zenith_combined.py)
├── output/
├── test_pictures/
└── models/
└── last.pt
---

## Use Cases
Maritime domain awareness
Coastal surveillance and security
Illegal fishing detection
Anti-smuggling operations
Search and rescue intelligence support

---

## Data Compatibility

Zenith is designed to be data-source agnostic and can integrate with:

Open SAR datasets (e.g., Sentinel-1)
Commercial SAR providers
National systems such as NAIS (AIS) and RISAT (SAR), subject to access

---

## Highlights
Works in low-visibility conditions (SAR advantage)
Detects non-cooperative vessels
Combines multi-source intelligence (SAR + AIS)
Scalable for real-world maritime operations

---

## Team

Team Zenith

* Rik Mukherjee
* Hari Pooreni Balaji
* Kanishka Sharma
* Aadhidev M S
