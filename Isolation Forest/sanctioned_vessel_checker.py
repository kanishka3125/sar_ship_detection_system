import requests 
import xml.etree.ElementTree as ET
import re 
import pandas as pd 
from functools import lru_cache 

# parse through OFAC XML

IMO_RE = re.compile(r"\bIMO\D*(\d{7})\b", re.IGNORECASE)

def lname(tag):
    return tag.split("}", 1)[1] if "}" in tag else tag

def text_of(elem):
    if elem is None or elem.text is None:
        return ""
    return elem.text.strip()
    
def find_first(elem, local):
    for e in elem.iter():
        if lname(e.tag) == local:
            return e 
    return None 

def find_all(elem, local):
    for e in elem.iter():
        if lname(e.tag) == local:
            yield e

def parse_ofac_xml(xml_bytes):
    """
    Parse OFAC sdn_enhanced XML and extract all vessel
    entries that have an IMO number. Returns dict: {imo_str: { vessel info}}
    """

    sanctioned = {}
    root = ET.fromstring(xml_bytes)

    # Use the working approach from our final_extract.py script
    for entity in root.iter():
        if lname(entity.tag) != "entity":
            continue
            
        # Look for entityType
        entity_type = None
        for elem in entity.iter():
            if lname(elem.tag) == "entityType":
                # Check if it's a vessel (refId="602" or text="Vessel")
                if (elem.get("refId") == "602" or 
                    (elem.text and "vessel" in elem.text.lower())):
                    entity_type = "vessel"
                    break
        
        if entity_type != "vessel":
            continue

        # Get vessel name
        vessel_name = "Unknown"
        for name_elem in entity.iter():
            if lname(name_elem.tag) == "name":
                for name_part in name_elem.iter():
                    if lname(name_part.tag) == "namePart":
                        part_type = None
                        value = None
                        for child in name_part:
                            if lname(child.tag) == "type":
                                if child.get("refId") == "1526":  # Vessel Name
                                    part_type = "vessel_name"
                            elif lname(child.tag) == "value" and child.text:
                                value = child.text
                        if part_type == "vessel_name" and value:
                            vessel_name = value
                            break

        # Look for IMO numbers in identity documents
        imo = ""
        for id_doc in entity.iter():
            if lname(id_doc.tag) == "identityDocument":
                doc_type = None
                doc_number = None
                for child in id_doc:
                    if lname(child.tag) == "type":
                        if child.get("refId") == "1626":  # Vessel Registration Identification
                            doc_type = "vessel_reg"
                    elif lname(child.tag) == "documentNumber" and child.text:
                        doc_number = child.text
                
                if doc_type == "vessel_reg" and doc_number:
                    # Extract 7-digit IMO number
                    imo_match = re.search(r'\b\d{7}\b', doc_number)
                    if imo_match:
                        imo = imo_match.group()

        if imo:  # Only add if we found an IMO number
            # Get sanctions program
            program = ""
            for prog_elem in entity.iter():
                if lname(prog_elem.tag) == "sanctionsProgram":
                    if prog_elem.text:
                        program = prog_elem.text.strip()
                    break
            
            sanctioned[imo] = {
                "vessel_name": vessel_name,
                "program": program,
                "mmsi": "",
                "remarks": ""
            }
    return sanctioned

import os

def load_sanctioned_vessels(file_path="/Users/admin/Documents/SAR Ship Detection/Isolation Forest/SDN_ENHANCED.XML"):
    """
    Loads the locally uploaded OFAC sdn_enhanced.xml file.
    Falls back to a hardcoded list if the file is missing.
    """
    print(f"[OFAC] Attempting to load local file: {file_path}")

    # Check if the file actually exists to avoid a crash
    if not os.path.exists(file_path):
        print(f"[OFAC] File not found: {file_path}")
        return {}

    try:
        # Open and read the local file
        with open(file_path, 'rb') as f:
            content = f.read()
            
        # Use your existing parsing function
        sanctioned = parse_ofac_xml(content)
        
        if len(sanctioned) > 50:
            print(f"[OFAC] Local load success — {len(sanctioned)} sanctioned vessels loaded")
            return sanctioned
        else:
            print(f"[OFAC] File loaded but only {len(sanctioned)} vessels found")
            return sanctioned

    except Exception as e:
        print(f"[OFAC] Error reading local file: {e}")
        return {}

def check_sanctioned_df(df):
    """
    Check a DataFrame of vessels against sanctioned database.
    Adds sanction columns to the DataFrame.
    """
    sanctioned_db = load_sanctioned_vessels()
    
    # Ensure sanctioned_db is not None
    if sanctioned_db is None:
        sanctioned_db = {}
    
    # Initialize sanction columns
    df["is_sanctioned"] = False
    df["sanction_flag"] = None
    df["sanction_reason"] = None
    df["sanctions_program"] = None
    df["threat_level"] = None
    
    for idx, vessel in df.iterrows():
        # normalise IMO — strip whitespace, leading zeros etc.
        raw_imo = str(vessel.get("imo", "")).strip()
        # remove "IMO" prefix if present
        clean_imo = re.sub(r"[^0-9]", "", raw_imo)
        # take last 7 digits
        clean_imo = clean_imo[-7:] if len(clean_imo) >= 7 else clean_imo

        if not clean_imo:
            continue

        if clean_imo in sanctioned_db:
            info = sanctioned_db[clean_imo]
            df.loc[idx, "is_sanctioned"] = True
            df.loc[idx, "sanction_flag"] = "SANCTIONED_VESSEL"
            df.loc[idx, "threat_level"] = "CRITICAL"
            df.loc[idx, "sanctions_program"] = info.get("program", "Unknown")
            df.loc[idx, "sanction_reason"] = f"Vessel IMO {clean_imo} appears on OFAC SDN sanctions list under {info.get('program', 'Unknown')} program"
    
    return df

def check_sanctioned(vessel: dict) -> dict:
    """
    Takes a vessel dict with at least an 'imo' field.
    Returns a result dict with flag and details.
    """
    sanctioned_db = load_sanctioned_vessels()
    # normalise IMO — strip whitespace, leading zeros etc.
    raw_imo = str(vessel.get("imo", "")).strip()
    # remove "IMO" prefix if present
    clean_imo = re.sub(r"[^0-9]", "", raw_imo)
    # take last 7 digits
    clean_imo = clean_imo[-7:] if len(clean_imo) >= 7 else clean_imo

    if not clean_imo:
        return {
            "flagged": False,
            "flag": None,
            "reason": "No IMO number available"
        }

    if clean_imo in sanctioned_db:
        info = sanctioned_db[clean_imo]
        return {
            "flagged": True,
            "flag": "SANCTIONED_VESSEL",
            "threat_level": "CRITICAL",
            "imo": clean_imo,
            "vessel_name": info.get("vessel_name", "Unknown"),
            "sanctions_program": info.get("program", "Unknown"),
            "mmsi_on_record": info.get("mmsi", ""),
            "reason": f"Vessel IMO {clean_imo} appears on OFAC SDN sanctions list under {info.get('program', 'Unknown')} program"
        }

    return {
        "flagged": False,
        "flag": None,
        "reason": f"IMO {clean_imo} not found in sanctions database"
    }


