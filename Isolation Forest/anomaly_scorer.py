import pandas as pd 
import numpy as np
from sklearn.ensemble import IsolationForest

np.random.seed(42)

def score_anomalies(df):
    # Select relevant features for anomaly detection
    features = df[[
        "mmsi", "sog", "cog", "heading", "length", "width", "draft", "lat", "lon"
    ]].copy()
    
    # Handle any missing values
    features = features.fillna(features.mean())
    
    # Initialize and fit the model
    model = IsolationForest(contamination=0.05, random_state=42)
    model.fit(features)
    
    # Predict anomalies (-1 for anomaly, 1 for normal)
    df["anomaly"] = model.predict(features)
    
    return df