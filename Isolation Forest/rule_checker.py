import pandas as pd

def check_rules(df):
    flags_list = []

    # Check individual vessel rules
    for _, vessel in df.iterrows():
        flags = []

        # Dark vessel (you'll simulate later)
        if vessel.get("ais_match", 1) == 0 and vessel.get("in_sar_detection", True):
            flags.append("Dark Vessel")

        # Speed anomaly
        if vessel["sog"] > 40:
            flags.append("Speed Anomaly")

        flags_list.append(flags)

    df["flags"] = flags_list

    # Spoofing detection (duplicate MMSI with location jumps)
    df = df.sort_values(["mmsi", "base_date_time"])
    df["lat_diff"] = df.groupby("mmsi")["lat"].diff().abs()
    df["lon_diff"] = df.groupby("mmsi")["lon"].diff().abs()
    spoof_mask = (df["lat_diff"] > 1) | (df["lon_diff"] > 1)
    df.loc[spoof_mask, "flags"] = df.loc[spoof_mask, "flags"].apply(lambda x: x + ["Spoofing"])

    # Clustering (nearby vessels) - done after individual checks
    # Create grid bins (spatial grouping)
    df["lat_bin"] = (df["lat"] * 1000).astype(int)
    df["lon_bin"] = (df["lon"] * 1000).astype(int)

    # Count ships in each grid cell
    cluster_counts = df.groupby(["lat_bin", "lon_bin"]).size()

    # Map counts back
    df["cluster_size"] = df.set_index(["lat_bin", "lon_bin"]).index.map(cluster_counts)

    # Flag clusters
    cluster_mask = df["cluster_size"] > 3
    df.loc[cluster_mask, "flags"] = df.loc[cluster_mask, "flags"].apply(lambda x: x + ["Clustering"])

    # Clean up temporary columns
    df = df.drop(columns=["lat_bin", "lon_bin", "cluster_size", "lat_diff", "lon_diff"])

    return df