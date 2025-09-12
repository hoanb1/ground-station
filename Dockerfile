# Build arguments for versioning
ARG VERSION_BUILD_NUMBER=dev
ARG VERSION_GIT_COMMIT=unknown

# Stage 1: Build the frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package.json frontend/package-lock.json* ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source code
COPY frontend/ ./

# Set up environment and build
ARG VERSION_BUILD_NUMBER
ARG VERSION_GIT_COMMIT
RUN cp .env.production .env && \
    echo "VITE_APP_VERSION_BUILD=${VERSION_BUILD_NUMBER}" >> .env && \
    echo "VITE_APP_VERSION_COMMIT=${VERSION_GIT_COMMIT}" >> .env && \
    npm run build

# Stage 2: Set up the Python backend
FROM ubuntu:noble-20250127

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    git \
    build-essential \
    sudo \
    python3 \
    python3-dev \
    python3.12 \
    python3.12-venv \
    python3.12-dev \
    python3-pip \
    dh-autoreconf \
    python3-full \
    software-properties-common \
    librtlsdr-dev \
    libairspy-dev \
    libhackrf-dev \
    libboost-all-dev \
    swig \
    avahi-daemon \
    libavahi-client-dev \
    cmake g++ libpython3-dev python3-numpy \
    avahi-daemon \
    avahi-utils \
    libnss-mdns \
    dbus \
    gpg-agent \
    libsamplerate0-dev \
    python3-mako \
    python3-requests \
    libfftw3-dev \
    pkg-config \
    wget \
    && rm -rf /var/lib/apt/lists/* && \
    mkdir -p /var/run/avahi-daemon /var/run/dbus && \
    ln -sf /usr/bin/python3 /usr/bin/python

# Copy backend requirements
COPY backend/requirements.txt .

# Set up Python environment
RUN pip install --break-system-packages --ignore-installed numpy==2.3.1 && \
    python3 -m venv /app/venv && \
    echo "/usr/local/lib" > /etc/ld.so.conf.d/local.conf && \
    ldconfig

ENV PATH="/app/venv/bin:$PATH"

# Compile UHD from source with Python API
RUN cd /src && \
    git clone https://github.com/EttusResearch/uhd.git && \
    cd uhd/host/ && \
    mkdir build && \
    cd build && \
    cmake -DENABLE_PYTHON_API=ON .. && \
    make -j`nproc` && \
    sudo make install && \
    sudo ldconfig && \
    cp -r /usr/local/lib/python3.12/site-packages/uhd* /app/venv/lib/python3.12/site-packages/ || true && \
    cp -r /usr/local/lib/python3.12/site-packages/usrp* /app/venv/lib/python3.12/site-packages/ || true

# Install Python dependencies
WORKDIR /app
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Compile SoapySDR and related libraries
RUN cd /src && \
    git clone https://github.com/pothosware/SoapySDR.git && \
    cd SoapySDR/ && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j`nproc` && \
    sudo make install -j`nproc` && \
    sudo ldconfig

RUN cd /src && \
    git clone https://github.com/pothosware/SoapyRemote.git && \
    cd SoapyRemote/ && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j`nproc` && \
    sudo make install -j`nproc` && \
    sudo ldconfig

# Compile various device-specific SoapySDR modules
RUN cd /src && \
    # RTLSDR Module \
    git clone https://github.com/pothosware/SoapyRTLSDR.git && \
    cd SoapyRTLSDR/ && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j`nproc` && \
    sudo make install && \
    sudo ldconfig && \
    # Airspy Module
    cd /src && \
    git clone https://github.com/pothosware/SoapyAirspy.git && \
    cd SoapyAirspy/ && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j`nproc` && \
    sudo make install && \
    sudo ldconfig && \
    # UHD Module
    cd /src && \
    git clone https://github.com/pothosware/SoapyUHD.git && \
    cd SoapyUHD/ && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j`nproc` && \
    sudo make install && \
    sudo ldconfig && \
    # HackRF Module
    cd /src && \
    git clone https://github.com/pothosware/SoapyHackRF.git && \
    cd SoapyHackRF/ && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j`nproc` && \
    sudo make install && \
    sudo ldconfig

# Compile LimeSuite
RUN cd /src && \
    git clone https://github.com/myriadrf/LimeSuite.git && \
    cd LimeSuite/ && \
    git checkout stable && \
    sed -i '1i\#include <cstdint>' src/lms7002m_mcu/MCU_File.cpp && \
    mkdir builddir && \
    cd builddir/ && \
    cmake ../ && \
    make -j4 && \
    sudo make install && \
    sudo ldconfig

# Compile Hamlib
RUN cd /src && \
    git clone https://github.com/Hamlib/Hamlib.git && \
    cd Hamlib/ && \
    ./bootstrap && \
    ./configure --with-python-binding && \
    make && \
    sudo make install

# Compile csdr and pycsdr
RUN cd /src && \
    git clone https://github.com/jketterl/csdr.git && \
    cd csdr/ && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make && \
    make install && \
    ldconfig && \
    cd /src && \
    git clone https://github.com/jketterl/pycsdr.git && \
    cd pycsdr/ && \
    ./setup.py install install_headers

# Set up library paths
WORKDIR /app
RUN ldconfig -v | grep "/usr/local/lib" && \
    mkdir -p "/app/venv/lib/python3.12/site-packages/Hamlib/" && \
    ls -la /usr/local/lib/python3.12/site-packages/ && \
    find / -name "python*" | grep bin && \
    echo $PATH && \
    which python3 && \
    cat /etc/os-release && \
    cp /usr/local/lib/python3.12/site-packages/*Hamlib* /app/venv/lib/python3.12/site-packages/Hamlib && \
    cp /usr/local/lib/python3.12/site-packages/*SoapySDR* /app/venv/lib/python3.12/site-packages/ && \
    ls -la /app/venv/lib/python3.12/site-packages/Hamlib

# Download and place the USRP B210 FPGA binary
RUN mkdir -p /usr/local/share/uhd/images && \
    wget -O /usr/local/share/uhd/images/libresdr_b210.bin \
    https://github.com/Rashed97/docker_open5gs/raw/refs/heads/exp_5g_ims_pyhss/srsran/usrp_b220_fpga.bin

# Copy backend code and inject version information
COPY backend/ ./backend/
ARG VERSION_BUILD_NUMBER
ARG VERSION_GIT_COMMIT
RUN sed -i "s/BUILD_NUMBER = \"dev\"/BUILD_NUMBER = \"${VERSION_BUILD_NUMBER}\"/g" backend/server/version.py && \
    sed -i "s/GIT_COMMIT = \"unknown\"/GIT_COMMIT = \"${VERSION_GIT_COMMIT}\"/g" backend/server/version.py

# Copy the built frontend from the previous stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Configure backend to serve static files
VOLUME /app/data
ENV PYTHONPATH=/app
ENV STATIC_FILES_DIR=/app/frontend/dist
EXPOSE 7000
WORKDIR backend/

# Command to run the application with UHD images downloader
CMD dbus-daemon --system --nofork --nopidfile & \
    sleep 2 && \
    avahi-daemon --no-chroot -D & \
    sleep 2 && \
    /usr/local/bin/uhd_images_downloader && \
    cp /usr/local/share/uhd/images/libresdr_b210.bin /usr/local/share/uhd/images/usrp_b210_fpga.bin && \
    python app.py --secret-key=AuZ9theig2geu4wu --log-level=INFO --host=0.0.0.0 --port=7000
