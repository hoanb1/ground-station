#!/bin/bash
# Startup script for Ground Station with conditional UHD device support

# Run once here to make sure all new libraries are loaded
ldconfig

# Start system services
dbus-daemon --system --nofork --nopidfile &
sleep 2
avahi-daemon --no-chroot -D &
sleep 2

# Download official UHD images
/usr/local/bin/uhd_images_downloader

# Use LibreSDR FPGA
cp /usr/local/share/uhd/images/libresdr_b210.bin /usr/local/share/uhd/images/usrp_b210_fpga.bin
echo "LibreSDR FPGA image installed"

# Show a list of UHD images
ls -l /usr/local/share/uhd/images/*.bin

# Start the application
# Note: Database migrations will run automatically on startup via init_db()
echo "Starting Ground Station application..."
cd /app/backend
exec python app.py --log-level=INFO --host=0.0.0.0 --port=7000
