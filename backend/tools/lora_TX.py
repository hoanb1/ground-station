#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# type: ignore
# flake8: noqa
# mypy: ignore-errors

#
# SPDX-License-Identifier: GPL-3.0
#
# GNU Radio Python Flow Graph
# Title: Lora Tx
# Author: Tapparel Joachim@EPFL,TCL
# GNU Radio version: 3.10.9.2

import logging
import signal
import sys
from enum import IntEnum

import gnuradio.lora_sdr as lora_sdr
import pmt
from gnuradio import blocks, gr, soapy

logger = logging.getLogger(__name__)


class CodingRate(IntEnum):
    """LoRa coding rate enumeration"""

    CR_4_5 = 1
    CR_4_6 = 2
    CR_4_7 = 3
    CR_4_8 = 4

    def __str__(self):
        return {
            1: "4/5",
            2: "4/6",
            3: "4/7",
            4: "4/8",
        }[self.value]


class lora_TX(gr.top_block):

    def __init__(self):
        gr.top_block.__init__(self, "Lora Tx", catch_exceptions=True)

        ##################################################
        # Variables
        ##################################################
        self.bw = bw = 125000
        self.sf = sf = 7
        self.samp_rate = samp_rate = int(bw * 4)
        self.impl_head = impl_head = False
        self.has_crc = has_crc = True
        self.frame_period = frame_period = 2000
        self.cr = cr = CodingRate.CR_4_5
        self.center_freq = center_freq = 437.4e6
        self.TX_gain = TX_gain = 50

        logger.info(
            f"LoRa TX Configuration - Frequency: {center_freq/1e6:.2f} MHz, "
            f"SF: {sf}, BW: {bw/1000:.0f} kHz, CR: {CodingRate(cr)}, "
            f"CRC: {has_crc}, Implicit Header: {impl_head}, "
            f"TX Gain: {TX_gain} dB, Sample Rate: {samp_rate/1e6:.2f} Msps"
        )

        ##################################################
        # Blocks
        ##################################################

        self.soapy_limesdr_sink_0 = None
        dev = "driver=lime"
        stream_args = ""
        tune_args = [""]
        settings = [""]

        self.soapy_limesdr_sink_0 = soapy.sink(
            dev, "fc32", 1, "calibrate=0", stream_args, tune_args, settings
        )
        self.soapy_limesdr_sink_0.set_sample_rate(0, samp_rate)
        self.soapy_limesdr_sink_0.set_bandwidth(0, 5000000)
        self.soapy_limesdr_sink_0.set_frequency(0, center_freq)
        self.soapy_limesdr_sink_0.set_frequency_correction(0, 0)
        self.soapy_limesdr_sink_0.set_gain(0, min(max(TX_gain, -12.0), 64.0))
        self.lora_sdr_whitening_0 = lora_sdr.whitening(False, False, ",", "packet_len")
        self.lora_sdr_payload_id_inc_0 = lora_sdr.payload_id_inc(":")
        self.lora_sdr_modulate_0 = lora_sdr.modulate(
            sf, samp_rate, bw, [0x34], (int(20 * 2**sf * samp_rate / bw)), 8
        )
        self.lora_sdr_modulate_0.set_min_output_buffer(10000000)
        self.lora_sdr_interleaver_0 = lora_sdr.interleaver(cr, sf, 0, 125000)
        self.lora_sdr_header_0 = lora_sdr.header(impl_head, has_crc, cr)
        self.lora_sdr_hamming_enc_0 = lora_sdr.hamming_enc(cr, sf)
        self.lora_sdr_gray_demap_0 = lora_sdr.gray_demap(sf)
        self.lora_sdr_add_crc_0 = lora_sdr.add_crc(has_crc)
        self.blocks_message_strobe_0 = blocks.message_strobe(
            pmt.intern("hello world: 0"), frame_period
        )

        ##################################################
        # Connections
        ##################################################
        self.msg_connect(
            (self.blocks_message_strobe_0, "strobe"), (self.lora_sdr_payload_id_inc_0, "msg_in")
        )
        self.msg_connect(
            (self.blocks_message_strobe_0, "strobe"), (self.lora_sdr_whitening_0, "msg")
        )
        self.msg_connect(
            (self.lora_sdr_payload_id_inc_0, "msg_out"), (self.blocks_message_strobe_0, "set_msg")
        )
        self.connect((self.lora_sdr_add_crc_0, 0), (self.lora_sdr_hamming_enc_0, 0))
        self.connect((self.lora_sdr_gray_demap_0, 0), (self.lora_sdr_modulate_0, 0))
        self.connect((self.lora_sdr_hamming_enc_0, 0), (self.lora_sdr_interleaver_0, 0))
        self.connect((self.lora_sdr_header_0, 0), (self.lora_sdr_add_crc_0, 0))
        self.connect((self.lora_sdr_interleaver_0, 0), (self.lora_sdr_gray_demap_0, 0))
        self.connect((self.lora_sdr_modulate_0, 0), (self.soapy_limesdr_sink_0, 0))
        self.connect((self.lora_sdr_whitening_0, 0), (self.lora_sdr_header_0, 0))

    def get_bw(self):
        return self.bw

    def set_bw(self, bw):
        self.bw = bw
        self.set_samp_rate(int(self.bw * 8))

    def get_sf(self):
        return self.sf

    def set_sf(self, sf):
        self.sf = sf
        self.lora_sdr_gray_demap_0.set_sf(self.sf)
        self.lora_sdr_hamming_enc_0.set_sf(self.sf)
        self.lora_sdr_interleaver_0.set_sf(self.sf)

    def get_samp_rate(self):
        return self.samp_rate

    def set_samp_rate(self, samp_rate):
        self.samp_rate = samp_rate
        self.soapy_limesdr_sink_0.set_sample_rate(0, self.samp_rate)

    def get_impl_head(self):
        return self.impl_head

    def set_impl_head(self, impl_head):
        self.impl_head = impl_head

    def get_has_crc(self):
        return self.has_crc

    def set_has_crc(self, has_crc):
        self.has_crc = has_crc

    def get_frame_period(self):
        return self.frame_period

    def set_frame_period(self, frame_period):
        self.frame_period = frame_period
        self.blocks_message_strobe_0.set_period(self.frame_period)

    def get_cr(self):
        return self.cr

    def set_cr(self, cr):
        self.cr = cr
        self.lora_sdr_hamming_enc_0.set_cr(self.cr)
        self.lora_sdr_header_0.set_cr(self.cr)
        self.lora_sdr_interleaver_0.set_cr(self.cr)

    def get_center_freq(self):
        return self.center_freq

    def set_center_freq(self, center_freq):
        self.center_freq = center_freq
        self.soapy_limesdr_sink_0.set_frequency(0, self.center_freq)

    def get_TX_gain(self):
        return self.TX_gain

    def set_TX_gain(self, TX_gain):
        self.TX_gain = TX_gain
        self.soapy_limesdr_sink_0.set_gain(0, min(max(self.TX_gain, -12.0), 64.0))


def main(top_block_cls=lora_TX, options=None):
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
    tb = top_block_cls()

    def sig_handler(sig=None, frame=None):
        tb.stop()
        tb.wait()

        sys.exit(0)

    signal.signal(signal.SIGINT, sig_handler)
    signal.signal(signal.SIGTERM, sig_handler)

    tb.start()

    try:
        input("Press Enter to quit: ")
    except EOFError:
        pass
    tb.stop()
    tb.wait()


if __name__ == "__main__":
    main()
