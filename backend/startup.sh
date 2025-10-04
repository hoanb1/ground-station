#!/bin/bash
# Startup script for Ground Station with conditional UHD device support

# Start system services
dbus-daemon --system --nofork --nopidfile &
sleep 2
avahi-daemon --no-chroot -D &
sleep 2

# Download official UHD images
/usr/local/bin/uhd_images_downloader

# Detect connected devices
echo "Detecting UHD devices..."
uhd_find_devices > /tmp/uhd_devices.txt 2>&1
cat /tmp/uhd_devices.txt

# Check if LibreSDR B210 is connected (name contains "LibreSDR")
if grep -q "name: LibreSDR" /tmp/uhd_devices.txt; then
    echo "LibreSDR B210 detected - using LibreSDR FPGA image"
    # Backup original B210 FPGA if it exists
    if [ -f /usr/local/share/uhd/images/usrp_b210_fpga.bin ]; then
        cp /usr/local/share/uhd/images/usrp_b210_fpga.bin /usr/local/share/uhd/images/usrp_b210_fpga.bin.ettus_original
    fi
    # Use LibreSDR FPGA
    cp /usr/local/share/uhd/images/libresdr_b210.bin /usr/local/share/uhd/images/usrp_b210_fpga.bin
    echo "LibreSDR FPGA image installed"
else
    echo "Standard Ettus B210 detected - using official FPGA image"
    # Restore original Ettus FPGA if we had backed it up
    if [ -f /usr/local/share/uhd/images/usrp_b210_fpga.bin.ettus_original ]; then
        cp /usr/local/share/uhd/images/usrp_b210_fpga.bin.ettus_original /usr/local/share/uhd/images/usrp_b210_fpga.bin
        echo "Restored original Ettus FPGA image"
    fi
fi

# Verify final device detection
echo "Final device check:"
uhd_find_devices
SoapySDRUtil --find

# Start the application
echo "Starting Ground Station application..."
cd /app/backend
exec python app.py --log-level=INFO --host=0.0.0.0 --port=7000
