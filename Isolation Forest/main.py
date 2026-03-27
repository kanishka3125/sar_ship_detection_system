import pandas as pd
from anomaly_scorer import score_anomalies
from rule_checker import check_rules
from sanctioned_vessel_checker import check_sanctioned_df

print("Step 1: Loading data...")
df = pd.read_csv("guam_2023.csv")

#print("Step 2: Sampling...")
#df = df.sample(n=20000, random_state=42)

print("Step 2: Extracting lat/lon...")
df["lon"] = df["geometry"].str.extract(r'POINT \((.*) ')[0].astype(float)
df["lat"] = df["geometry"].str.extract(r'POINT \((?:.*) (.*)\)')[0].astype(float)

print("Step 3: Cleaning...")
df = df.dropna(subset=["lat", "lon"])

print("Step 4: Adding flags...")
df["ais_match"] = 1
df["in_sar_detection"] = True

print("Step 5: Running rule checker...")
df = check_rules(df)
print("Rule checker DONE")

print("Step 6: Running anomaly detection...")
df = score_anomalies(df)
print("Anomaly detection DONE")

print("Step 7: Running sanctioned vessel checker...")
df = check_sanctioned_df(df)
print("Sanctioned vessel checker DONE")

print("Step 8: Output:")
print(df.head())
# Filter to show only the vessels that triggered a sanction hit
hits = df[df["is_sanctioned"] == True]
if not hits.empty:
    print(f"FOUND {len(hits)} SANCTIONED HITS:")
    print(hits[["vessel_name", "imo", "sanctions_program"]])
else:
    print("No sanctioned vessels detected in current data.")