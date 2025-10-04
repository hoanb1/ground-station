# Stage 1: Build the frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package.json frontend/package-lock.json* ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source code
COPY frontend/ ./

# copy the .env template
RUN cp .env.production .env

# Build the frontend for production
RUN npm run build

# Stage 2: Set up the Python backend
#FROM python:3.12-slim
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
    && rm -rf /var/lib/apt/lists/*

## Add Ettus Research UHD Repository
#RUN apt-get update && \
#    apt-get install -y software-properties-common && \
#    add-apt-repository ppa:ettusresearch/uhd && \
#    apt-get update
#
## Install UHD packages
#RUN apt-get install -y libuhd-dev uhd-host python3-uhd

# Create required directories for Avahi and D-Bus
RUN mkdir -p /var/run/avahi-daemon /var/run/dbus

RUN ln -sf /usr/bin/python3 /usr/bin/python

# Copy backend requirements
COPY backend/requirements.txt .

# Install numpy 2.3.1 so that UHD picks it up on compile
RUN pip install --break-system-packages --ignore-installed numpy==2.3.1

## Install python3-mako needed by uhd
#RUN pip install mako

# Compile UHD from source with Python API
WORKDIR /src
RUN git clone https://github.com/EttusResearch/uhd.git
WORKDIR uhd/host/
RUN mkdir build
WORKDIR build/
RUN cmake -DENABLE_PYTHON_API=ON ..
RUN make -j`nproc`
RUN sudo make install
RUN sudo ldconfig

RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Copy UHD Python bindings to virtual environment
RUN cp -r /usr/local/lib/python3.12/site-packages/uhd* /app/venv/lib/python3.12/site-packages/ || true
RUN cp -r /usr/local/lib/python3.12/site-packages/usrp* /app/venv/lib/python3.12/site-packages/ || true

WORKDIR /app
# Now pip will use the virtual environment
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# compile SoapySDR
WORKDIR /src
RUN git clone https://github.com/pothosware/SoapySDR.git && \
    cd SoapySDR && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j`nproc` && \
    sudo make install -j`nproc` && \
    sudo ldconfig

# compile SoapySDRRemote
WORKDIR /src
RUN git clone https://github.com/pothosware/SoapyRemote.git && \
    cd SoapyRemote && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j`nproc` && \
    sudo make install -j`nproc` && \
    sudo ldconfig

# compile SoapySDR-RTLSDR
WORKDIR /src
RUN git clone https://github.com/pothosware/SoapyRTLSDR.git && \
    cd SoapyRTLSDR && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j`nproc` && \
    sudo make install && \
    sudo ldconfig

# compile SoapySDR-Airspy
WORKDIR /src
RUN git clone https://github.com/pothosware/SoapyAirspy.git && \
    cd SoapyAirspy && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j`nproc` && \
    sudo make install && \
    sudo ldconfig

# compile SoapySDR-UHD
WORKDIR /src
RUN git clone https://github.com/pothosware/SoapyUHD.git && \
    cd SoapyUHD && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j`nproc` && \
    sudo make install && \
    sudo ldconfig

# compile SoapySDR-hackrf
WORKDIR /src
RUN git clone https://github.com/pothosware/SoapyHackRF.git && \
    cd SoapyHackRF && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j`nproc` && \
    sudo make install && \
    sudo ldconfig

# compile LimeSuite
WORKDIR /src
RUN git clone https://github.com/myriadrf/LimeSuite.git && \
    cd LimeSuite && \
    git checkout stable && \
    sed -i '1i\#include <cstdint>' src/lms7002m_mcu/MCU_File.cpp && \
    mkdir builddir && \
    cd builddir && \
    cmake ../ && \
    make -j4 && \
    sudo make install && \
    sudo ldconfig

# compile Hamlib
WORKDIR /src
RUN git clone https://github.com/Hamlib/Hamlib.git && \
    cd Hamlib && \
    ./bootstrap && \
    ./configure --with-python-binding && \
    make && \
    sudo make install

# compile csdr
WORKDIR /src
RUN git clone https://github.com/jketterl/csdr.git && \
    cd csdr && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make && \
    make install && \
    ldconfig

# compile pycsdr
WORKDIR /src
RUN git clone https://github.com/jketterl/pycsdr.git && \
    cd pycsdr && \
    ./setup.py install install_headers

# Configure library paths and copy Python bindings
RUN echo "/usr/local/lib" > /etc/ld.so.conf.d/local.conf && \
    ldconfig && \
    mkdir -p "/app/venv/lib/python3.12/site-packages/Hamlib/" && \
    cp /usr/local/lib/python3.12/site-packages/*Hamlib* /app/venv/lib/python3.12/site-packages/Hamlib && \
    cp /usr/local/lib/python3.12/site-packages/*SoapySDR* /app/venv/lib/python3.12/site-packages/

# Download and place the USRP B210 FPGA binary for LibreSDR device
RUN mkdir -p /usr/local/share/uhd/images
RUN wget -O /usr/local/share/uhd/images/libresdr_b210.bin \
    https://github.com/Rashed97/docker_open5gs/raw/refs/heads/exp_5g_ims_pyhss/srsran/usrp_b220_fpga.bin

# Remove all that source code
#RUN rm -rf /src

WORKDIR /app

# Copy backend code
COPY backend/ ./backend/

# Copy and set permissions for startup script
COPY backend/startup.sh /app/startup.sh
RUN chmod +x /app/startup.sh

# Add build arguments for version information
ARG GIT_COMMIT
ARG BUILD_DATE
ARG BUILD_VERSION
ARG GS_ENVIRONMENT=production

# Set as environment variables for the container
ENV GIT_COMMIT=${GIT_COMMIT}
ENV BUILD_DATE=${BUILD_DATE}
ENV BUILD_VERSION=${BUILD_VERSION}
ENV GS_ENVIRONMENT=${GS_ENVIRONMENT}

# Run the version info file creation utility with an override, the git commit hash
RUN cd /app/backend && python -c "import os; from server.version import write_version_info_during_build; write_version_info_during_build({'gitCommit': os.environ.get('GIT_COMMIT', 'unknown')})"

# Copy the built frontend from the previous stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Configure backend to serve static files
# Create a volume for persistent data
VOLUME /app/data

# Set environment variables
ENV PYTHONPATH=/app
ENV STATIC_FILES_DIR=/app/frontend/dist

# Expose the port the app runs on
EXPOSE 7000

WORKDIR backend/

# Command to run the application with UHD images downloader and conditional FPGA loading
CMD ["/app/startup.sh"]
