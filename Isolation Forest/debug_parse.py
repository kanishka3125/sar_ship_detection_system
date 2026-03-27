import xml.etree.ElementTree as ET
import re

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

# Test parsing
with open("SDN_ENHANCED.XML", 'rb') as f:
    content = f.read()

root = ET.fromstring(content)
print("Root tag:", root.tag)

# Count entities
entity_count = 0
vessel_count = 0
imo_count = 0

for entity in find_all(root, "entity"):
    entity_count += 1
    
    # Check entity type
    entity_type_elem = find_first(entity, "entityType")
    if entity_type_elem:
        entity_type = text_of(entity_type_elem)
        entity_ref = entity_type_elem.get("refId", "")
        print(f"Entity {entity_count}: type='{entity_type}', refId='{entity_ref}'")
        
        if entity_ref == "602" or (entity_type and "vessel" in entity_type.lower()):
            vessel_count += 1
            print(f"  -> VESSEL FOUND!")
            
            # Look for IMO numbers
            for id_doc in find_all(entity, "identityDocument"):
                id_type_elem = find_first(id_doc, "type")
                if id_type_elem:
                    id_type_ref = id_type_elem.get("refId", "")
                    id_type_text = text_of(id_type_elem)
                    print(f"    ID doc: refId='{id_type_ref}', text='{id_type_text}'")
                    
                    if id_type_ref == "1626":  # Vessel Registration Identification
                        doc_number_elem = find_first(id_doc, "documentNumber")
                        if doc_number_elem:
                            doc_number = text_of(doc_number_elem)
                            print(f"      Document number: {doc_number}")
                            imo_match = re.search(r'\b\d{7}\b', doc_number)
                            if imo_match:
                                imo_count += 1
                                print(f"      -> IMO FOUND: {imo_match.group()}")

print(f"\nSummary:")
print(f"Total entities: {entity_count}")
print(f"Vessels found: {vessel_count}")
print(f"IMO numbers found: {imo_count}")
