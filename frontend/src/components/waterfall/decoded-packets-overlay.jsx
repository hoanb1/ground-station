/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import React, { useMemo } from 'react';
import { Box, Typography, useTheme, alpha, Tooltip } from '@mui/material';
import { useSelector } from 'react-redux';
import { getNoradFromCallsign } from '../../utils/satellite-lookup';

const DecodedPacketsOverlay = ({
    containerWidth = 0,
    showLeftSide = false,
    showRightSide = false,
    leftSideWidth = 60,
    rightSideWidth = 50
}) => {
    const theme = useTheme();
    const { outputs } = useSelector((state) => state.decoders);
    const { packetsDrawerOpen } = useSelector((state) => state.waterfall);

    // Calculate overlay width based on parent container and visible sidebars
    const overlayWidth = useMemo(() => {
        const leftWidth = showLeftSide ? leftSideWidth : 0;
        const rightWidth = showRightSide ? rightSideWidth : 0;
        return containerWidth - leftWidth - rightWidth;
    }, [containerWidth, showLeftSide, showRightSide, leftSideWidth, rightSideWidth]);

    // Get all packets with callsigns
    const recentPackets = useMemo(() => {
        console.log('[DecodedPacketsOverlay] Total outputs:', outputs.length);

        const packets = outputs
            .filter(output =>
                output.output?.callsigns?.from &&
                output.output?.callsigns?.to
            )
            .map(output => {
                const fromCallsign = output.output.callsigns.from;
                const noradId = getNoradFromCallsign(fromCallsign);

                console.log('[DecodedPacketsOverlay] Packet callsign:', fromCallsign, '-> NORAD:', noradId);

                return {
                    id: output.id,
                    timestamp: new Date(output.timestamp * 1000),
                    from: fromCallsign,
                    to: output.output.callsigns.to,
                    packetNumber: output.output.packet_number,
                    packetLength: output.output.packet_length,
                    parameters: output.output.parameters,
                    vfo: output.vfo,
                    noradId: output.output.satellite?.norad_id || noradId,
                    satelliteName: output.output.satellite?.name,
                    telemetry: output.output.telemetry,  // Add parsed telemetry
                    decoderType: output.decoder_type,
                    parser: output.output.telemetry?.parser,
                };
            });

        console.log('[DecodedPacketsOverlay] Filtered packets:', packets.length);
        return packets;
    }, [outputs]);

    const hasPackets = recentPackets.length > 0;

    // Hide overlay when drawer is open, or when there are no packets
    if (!hasPackets || packetsDrawerOpen) {
        console.log('[DecodedPacketsOverlay] Not rendering - no packets or drawer is open');
        return null;
    }

    console.log('[DecodedPacketsOverlay] RENDERING OVERLAY');

    // Calculate left offset based on sidebar visibility
    const leftOffset = showLeftSide ? leftSideWidth : 0;

    return (
        <Box
            sx={{
                position: 'fixed',
                bottom: 50,
                left: leftOffset,
                width: overlayWidth,
                maxHeight: 250,
                zIndex: 9999,
                pointerEvents: 'none',
                px: 2.5, // 20px horizontal padding
            }}
        >
            <Box
                sx={{
                    backgroundColor: alpha(theme.palette.background.paper, 0.85),
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${alpha(theme.palette.border.main, 0.4)}`,
                    borderRadius: 1,
                    p: 1,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                    maxHeight: '100%',
                    overflowY: 'auto',
                    pointerEvents: 'auto', // Enable scrolling
                }}
            >

                {recentPackets.map((packet, index) => (
                    <Box
                        key={packet.id}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            py: 0.5,
                            borderTop: index > 0 ? `1px solid ${alpha(theme.palette.border.main, 0.15)}` : 'none',
                        }}
                    >
                        <Typography
                            variant="caption"
                            sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.7rem',
                                color: theme.palette.text.secondary,
                                minWidth: 45,
                            }}
                        >
                            {packet.timestamp.toLocaleTimeString('en-US', {
                                hour12: false,
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                            })}
                        </Typography>

                        {packet.satelliteName && (
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                }}
                            >
                                <Typography
                                    variant="caption"
                                    sx={{
                                        fontFamily: 'monospace',
                                        fontSize: '0.7rem',
                                        color: theme.palette.text.secondary,
                                    }}
                                >
                                    {packet.satelliteName}
                                </Typography>
                                {packet.noradId && (
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            fontFamily: 'monospace',
                                            fontSize: '0.65rem',
                                            color: theme.palette.text.disabled,
                                        }}
                                    >
                                        ({packet.noradId})
                                    </Typography>
                                )}
                            </Box>
                        )}

                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.75,
                                flex: 1,
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    color: theme.palette.primary.main,
                                }}
                            >
                                {packet.from}
                            </Typography>

                            <Typography
                                variant="caption"
                                sx={{
                                    fontSize: '0.65rem',
                                    color: theme.palette.text.disabled,
                                }}
                            >
                                →
                            </Typography>

                            <Typography
                                variant="caption"
                                sx={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    color: theme.palette.secondary.main,
                                }}
                            >
                                {packet.to}
                            </Typography>
                        </Box>

                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                            }}
                        >
                            <Box
                                sx={{
                                    px: 0.5,
                                    py: 0.125,
                                    borderRadius: 0.5,
                                    backgroundColor: alpha(theme.palette.primary.main, 0.15),
                                    border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                                }}
                            >
                                <Typography
                                    variant="caption"
                                    sx={{
                                        fontFamily: 'monospace',
                                        fontSize: '0.6rem',
                                        fontWeight: 600,
                                        color: theme.palette.primary.main,
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    {packet.decoderType}
                                </Typography>
                            </Box>

                            <Box
                                sx={{
                                    px: 0.5,
                                    py: 0.125,
                                    borderRadius: 0.5,
                                    backgroundColor: alpha(theme.palette.secondary.main, 0.15),
                                    border: `1px solid ${alpha(theme.palette.secondary.main, 0.3)}`,
                                }}
                            >
                                <Typography
                                    variant="caption"
                                    sx={{
                                        fontFamily: 'monospace',
                                        fontSize: '0.6rem',
                                        fontWeight: 600,
                                        color: theme.palette.secondary.main,
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    {packet.parser}
                                </Typography>
                            </Box>

                            <Typography
                                variant="caption"
                                sx={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.65rem',
                                    color: theme.palette.text.secondary,
                                }}
                            >
                                {packet.packetLength}B
                            </Typography>

                            {packet.parameters && (
                                <Typography
                                    variant="caption"
                                    sx={{
                                        fontFamily: 'monospace',
                                        fontSize: '0.65rem',
                                        color: theme.palette.text.disabled,
                                    }}
                                >
                                    {packet.parameters}
                                </Typography>
                            )}

                            {packet.vfo && (
                                <Box
                                    sx={{
                                        px: 0.5,
                                        py: 0.125,
                                        borderRadius: 0.5,
                                        backgroundColor: alpha(theme.palette.info.main, 0.15),
                                        border: `1px solid ${alpha(theme.palette.info.main, 0.3)}`,
                                    }}
                                >
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            fontFamily: 'monospace',
                                            fontSize: '0.6rem',
                                            fontWeight: 600,
                                            color: theme.palette.info.main,
                                        }}
                                    >
                                        VFO{packet.vfo}
                                    </Typography>
                                </Box>
                            )}

                            {packet.telemetry && (
                                <Tooltip
                                    title={
                                        <Box sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                                            <div>Parser: {packet.telemetry.parser}</div>
                                            <div>PID: {packet.telemetry.frame?.pid}</div>
                                            <div>Format: {packet.telemetry.data?.format || 'parsed'}</div>
                                            {packet.telemetry.data?.hex && (
                                                <div>Payload: {packet.telemetry.data.hex.substring(0, 32)}...</div>
                                            )}
                                        </Box>
                                    }
                                    placement="top"
                                >
                                    <Box
                                        sx={{
                                            px: 0.5,
                                            py: 0.125,
                                            borderRadius: 0.5,
                                            backgroundColor: alpha(theme.palette.success.main, 0.15),
                                            border: `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
                                        }}
                                    >
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                fontFamily: 'monospace',
                                                fontSize: '0.6rem',
                                                fontWeight: 600,
                                                color: theme.palette.success.main,
                                            }}
                                        >
                                            TLM
                                        </Typography>
                                    </Box>
                                </Tooltip>
                            )}
                        </Box>
                    </Box>
                ))}
            </Box>
        </Box>
    );
};

export default DecodedPacketsOverlay;
