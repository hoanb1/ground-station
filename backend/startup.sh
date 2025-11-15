#!/bin/bash
# Startup script for Ground Station with conditional UHD device support

# Run once here to make sure all new libraries are loaded
ldconfig

# Start system services
dbus-daemon --system --nofork --nopidfile &
sleep 2
avahi-daemon --no-chroot -D &
sleep 2

# Start SDRplay API service
/opt/sdrplay_api/sdrplay_apiService &
sleep 2

# Set UHD images directory (defaults to /app/backend/data/uhd_images if not set)
export UHD_IMAGES_DIR=${UHD_IMAGES_DIR:-/app/backend/data/uhd_images}
echo "Using UHD images directory: $UHD_IMAGES_DIR"

# Set UHD config directory (defaults to /app/backend/data/uhd_config if not set)
export UHD_CONFIG_DIR=${UHD_CONFIG_DIR:-/app/backend/data/uhd_config}
echo "Using UHD config directory: $UHD_CONFIG_DIR"

# Create directories if they don't exist
mkdir -p "$UHD_IMAGES_DIR"
mkdir -p "$UHD_CONFIG_DIR"

# Create default uhd.conf if it doesn't exist
if [ ! -f "$UHD_CONFIG_DIR/uhd.conf" ]; then
    cat > "$UHD_CONFIG_DIR/uhd.conf" << 'EOF'
# UHD Configuration File
# Map device serial numbers to specific FPGA images
#
# Format:
# [type=b200,serial=XXXXXXXX]
# fpga=/path/to/custom_fpga.bin
#
# Example for LibreSDR B210:
# [type=b200,serial=31FA5E3]
# fpga=/app/backend/data/uhd_images/usrp_b210_fpga.bin
#
# You can add multiple device configurations below:

EOF
    echo "Created default uhd.conf at $UHD_CONFIG_DIR/uhd.conf"
fi

# Download official UHD images to the configured directory
/usr/local/bin/uhd_images_downloader

# Use LibreSDR FPGA - copy if it exists in the build location
if [ -f /usr/local/share/uhd/images/libresdr_b210.bin ]; then
    cp /usr/local/share/uhd/images/libresdr_b210.bin "$UHD_IMAGES_DIR/usrp_b210_fpga.bin"
    echo "LibreSDR FPGA image installed"
fi

# Show a list of UHD images
ls -l "$UHD_IMAGES_DIR"/*.bin 2>/dev/null || echo "No UHD images found yet in $UHD_IMAGES_DIR"

# Start the application
echo "Starting Ground Station application..."
cd /app/backend
exec python app.py --log-level=INFO --host=0.0.0.0 --port=7000
