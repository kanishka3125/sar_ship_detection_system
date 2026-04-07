#!/usr/bin/env python3
"""
SAR Ship Detection Image Processing Script
Processes raw SAR images and saves them in a format ready for ML training
"""

import cv2
import numpy as np
import os
from pathlib import Path

def process_all_images():
    """Process all images from raw_images and save to processed_images folder"""
    
    # Use relative paths for GitHub compatibility
    base_dir = Path(".")
    raw_images_dir = base_dir / "raw_images" / "archive"
    processed_images_dir = base_dir / "processed_images"
    
    # Create processed_images directory if it doesn't exist
    processed_images_dir.mkdir(exist_ok=True)
    
    print("Starting SAR Ship Detection Image Processing...")
    print(f"Raw images directory: {raw_images_dir}")
    print(f"Output directory: {processed_images_dir}")
    
    if not raw_images_dir.exists():
        print(f"Error: Raw images directory not found at {raw_images_dir}")
        print("Please ensure the raw_images folder exists with the archive subdirectory")
        return
    
    # Find all image subdirectories in raw_images/archive
    image_dirs = []
    for item in raw_images_dir.iterdir():
        if item.is_dir() and "JPEGImages" in item.name:
            # Look for nested subdirectories that contain images
            for subitem in item.iterdir():
                if subitem.is_dir():
                    # Check if this subdirectory contains image files
                    image_files = list(subitem.glob("*.jpg")) + list(subitem.glob("*.jpeg")) + \
                                 list(subitem.glob("*.png")) + list(subitem.glob("*.tif")) + \
                                 list(subitem.glob("*.bmp"))
                    if image_files:
                        image_dirs.append(subitem)
    
    if not image_dirs:
        print("No image directories found containing 'JPEGImages' in the name")
        print("Available directories:", [d.name for d in raw_images_dir.iterdir() if d.is_dir()])
        return
    
    print(f"Found image directories: {[d.name for d in image_dirs]}")
    
    total_processed = 0
    total_errors = 0
    
    for image_dir in image_dirs:
        print(f"\nProcessing directory: {image_dir.name}")
        
        # Create corresponding processed subdirectory
        processed_subdir = processed_images_dir / image_dir.name
        processed_subdir.mkdir(exist_ok=True)
        
        # Process all images in this directory
        image_files = list(image_dir.glob("*.jpg")) + list(image_dir.glob("*.jpeg")) + \
                     list(image_dir.glob("*.png")) + list(image_dir.glob("*.tif")) + \
                     list(image_dir.glob("*.bmp"))
        
        print(f"Found {len(image_files)} images in {image_dir.name}")
        
        for file_path in image_files:
            output_path = processed_subdir / file_path.name
            
            try:
                # Read image as grayscale
                image = cv2.imread(str(file_path), cv2.IMREAD_GRAYSCALE)
                if image is None:
                    print(f"Warning: Could not read {file_path.name}")
                    total_errors += 1
                    continue
                
                # Process image
                downscaled_img = cv2.resize(image, (640, 640), interpolation=cv2.INTER_AREA)
                median = cv2.medianBlur(downscaled_img, 3)
                normalized_image = cv2.normalize(
                    median, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX, dtype=cv2.CV_8U)
                rgb_image = cv2.cvtColor(normalized_image, cv2.COLOR_GRAY2RGB)
                
                # Save processed image
                success = cv2.imwrite(str(output_path), rgb_image)
                if success:
                    total_processed += 1
                    if total_processed % 50 == 0:  # Progress update every 50 images
                        print(f"Processed {total_processed} images...")
                else:
                    print(f"Failed to save: {file_path.name}")
                    total_errors += 1
                    
            except Exception as e:
                print(f"Error processing {file_path.name}: {str(e)}")
                total_errors += 1
    
    print(f"\nProcessing complete!")
    print(f"Total images processed: {total_processed}")
    print(f"Total errors: {total_errors}")
    print(f"Processed images saved in: {processed_images_dir}")

if __name__ == "__main__":
    process_all_images()
