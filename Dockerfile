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
    librtlsdr-dev \
    libairspy-dev \
    libuhd-dev \
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
    && rm -rf /var/lib/apt/lists/*

# Create required directories for Avahi and D-Bus
RUN mkdir -p /var/run/avahi-daemon /var/run/dbus

RUN ln -sf /usr/bin/python3 /usr/bin/python

# Copy backend requirements
COPY backend/requirements.txt .

RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Now pip will use the virtual environment
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

WORKDIR /src

# compile SoapySDR
RUN git clone https://github.com/pothosware/SoapySDR.git
WORKDIR SoapySDR/
RUN mkdir build
WORKDIR build/
RUN cmake ..
RUN make -j`nproc`
RUN sudo make install -j`nproc`
RUN sudo ldconfig

# compile SoapySDRRemote
WORKDIR /src
RUN git clone https://github.com/pothosware/SoapyRemote.git
WORKDIR SoapyRemote/
RUN mkdir build
WORKDIR build/
RUN cmake ..
RUN make -j`nproc`
RUN sudo make install -j`nproc`
RUN sudo ldconfig

# compile SoapySDR-RTLSDR
WORKDIR /src
RUN git clone https://github.com/pothosware/SoapyRTLSDR.git
WORKDIR SoapyRTLSDR/
RUN mkdir build
WORKDIR build/
RUN cmake ..
RUN make -j`nproc`
RUN sudo make install
RUN sudo ldconfig

# compile SoapySDR-Airspy
WORKDIR /src
RUN git clone https://github.com/pothosware/SoapyAirspy.git
WORKDIR SoapyAirspy/
RUN mkdir build
WORKDIR build/
RUN cmake ..
RUN make -j`nproc`
RUN sudo make install
RUN sudo ldconfig

# compile SoapySDR-UHD
WORKDIR /src
RUN git clone https://github.com/pothosware/SoapyUHD.git
WORKDIR SoapyUHD/
RUN mkdir build
WORKDIR build/
RUN cmake ..
RUN make -j`nproc`
RUN sudo make install
RUN sudo ldconfig

# compile SoapySDR-hackrf
WORKDIR /src
RUN git clone https://github.com/pothosware/SoapyHackRF.git
WORKDIR SoapyHackRF/
RUN mkdir build
WORKDIR build/
RUN cmake ..
RUN make -j`nproc`
RUN sudo make install
RUN sudo ldconfig

# compile Hamlib
WORKDIR /src
RUN git clone https://github.com/Hamlib/Hamlib.git
WORKDIR Hamlib/
RUN ./bootstrap
RUN ./configure --with-python-binding
RUN make
RUN sudo make install

RUN echo "/usr/local/lib" > /etc/ld.so.conf.d/local.conf && \
    ldconfig

RUN ldconfig -v | grep "/usr/local/lib"

WORKDIR /app

RUN mkdir "/app/venv/lib/python3.12/site-packages/Hamlib"
RUN mkdir -p "/app/venv/lib/python3.12/site-packages/Hamlib/"

# After the step you want to inspect
RUN ls -la /usr/local/lib/python3.12/site-packages/
RUN find / -name "python*" | grep bin
RUN echo $PATH
RUN which python3
RUN cat /etc/os-release

RUN cp /usr/local/lib/python3.12/site-packages/*Hamlib* /app/venv/lib/python3.12/site-packages/Hamlib
RUN cp /usr/local/lib/python3.12/site-packages/*SoapySDR* /app/venv/lib/python3.12/site-packages/

RUN ls -la /app/venv/lib/python3.12/site-packages/Hamlib

WORKDIR /app

# Copy backend code
COPY backend/ ./backend/

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

# Command to run the application
#CMD ["python", "app.py", "--secret-key=AuZ9theig2geu4wu", "--log-level=INFO", "--host=0.0.0.0", "--port=7000"]

CMD dbus-daemon --system --nofork --nopidfile & \
    sleep 2 && \
    avahi-daemon --no-chroot -D & \
    sleep 2 && \
    python app.py --secret-key=AuZ9theig2geu4wu --log-level=INFO --host=0.0.0.0 --port=7000