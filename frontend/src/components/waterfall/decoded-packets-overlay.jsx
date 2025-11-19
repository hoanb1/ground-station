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

import React, { useMemo, useEffect } from 'react';
import { Box, Typography, useTheme, alpha, CircularProgress, IconButton, Tooltip } from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import { useSelector, useDispatch } from 'react-redux';
import { getNoradFromCallsign } from '../../utils/satellite-lookup';
import { fetchDetectedSatellite, selectDetectedSatelliteByNorad, clearSatelliteOutputs } from '../decoders/decoders-slice';
import { useSocket } from '../common/socket';

const DecodedPacketsOverlay = ({
    containerWidth = 0,
    showLeftSide = false,
    showRightSide = false,
    leftSideWidth = 60,
    rightSideWidth = 50
}) => {
    const theme = useTheme();
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const { outputs } = useSelector((state) => state.decoders);

    // Calculate overlay width based on parent container and visible sidebars
    const overlayWidth = useMemo(() => {
        const leftWidth = showLeftSide ? leftSideWidth : 0;
        const rightWidth = showRightSide ? rightSideWidth : 0;
        return containerWidth - leftWidth - rightWidth;
    }, [containerWidth, showLeftSide, showRightSide, leftSideWidth, rightSideWidth]);

    // Get the most recent 5 BPSK packets with callsigns
    const recentPackets = useMemo(() => {
        console.log('[DecodedPacketsOverlay] Total outputs:', outputs.length);

        const packets = outputs
            .filter(output =>
                output.decoder_type === 'bpsk' &&
                output.output?.callsigns?.from &&
                output.output?.callsigns?.to
            )
            .slice(0, 5)
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
                    noradId: noradId
                };
            });

        console.log('[DecodedPacketsOverlay] Filtered packets:', packets.length);
        return packets;
    }, [outputs]);

    const hasPackets = recentPackets.length > 0;

    // Get the most recent packet's NORAD ID
    const latestNoradId = hasPackets ? recentPackets[0].noradId : null;

    console.log('[DecodedPacketsOverlay] Has packets:', hasPackets, 'Latest NORAD:', latestNoradId);

    // Get satellite info from Redux store
    const satelliteInfo = useSelector(latestNoradId ? selectDetectedSatelliteByNorad(latestNoradId) : () => null);

    console.log('[DecodedPacketsOverlay] Satellite info from store:', satelliteInfo);

    // Effect to fetch satellite info when a new NORAD ID is detected
    useEffect(() => {
        console.log('[DecodedPacketsOverlay] Latest NORAD ID:', latestNoradId);
        console.log('[DecodedPacketsOverlay] Socket available:', !!socket);
        console.log('[DecodedPacketsOverlay] Satellite info:', satelliteInfo);

        if (latestNoradId && socket) {
            // Check if we need to fetch (don't have it or it's been a while)
            const shouldFetch = !satelliteInfo ||
                               (satelliteInfo && !satelliteInfo.data && !satelliteInfo.loading && !satelliteInfo.error);

            console.log('[DecodedPacketsOverlay] Should fetch:', shouldFetch);

            if (shouldFetch) {
                console.log('[DecodedPacketsOverlay] Fetching satellite data for NORAD:', latestNoradId);
                dispatch(fetchDetectedSatellite({ socket, noradId: latestNoradId }));
            }
        }
    }, [latestNoradId, socket, satelliteInfo, dispatch]);

    // Only show when there are packets
    if (!hasPackets) {
        console.log('[DecodedPacketsOverlay] Not rendering - no packets');
        return null;
    }

    console.log('[DecodedPacketsOverlay] RENDERING OVERLAY');
    console.log('[DecodedPacketsOverlay] Satellite data.name:', satelliteInfo?.data?.name);
    console.log('[DecodedPacketsOverlay] Satellite data full:', satelliteInfo?.data);

    // Handle clear button click
    const handleClearSatellite = () => {
        if (!latestNoradId) return;

        // Find all output IDs that match this NORAD ID
        const outputIdsToRemove = outputs
            .filter(output => {
                if (output.decoder_type !== 'bpsk' || !output.output?.callsigns?.from) {
                    return false;
                }
                const outputNoradId = getNoradFromCallsign(output.output.callsigns.from);
                return outputNoradId === latestNoradId;
            })
            .map(output => output.id);

        // Dispatch the clear action with the IDs to remove
        dispatch(clearSatelliteOutputs({ noradId: latestNoradId, outputIds: outputIdsToRemove }));
    };

    // Calculate left offset based on sidebar visibility
    const leftOffset = showLeftSide ? leftSideWidth : 0;

    return (
        <Box
            sx={{
                position: 'fixed',
                bottom: 50,
                left: leftOffset,
                width: overlayWidth,
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
                }}
            >
                {/* Satellite Info Section */}
                {latestNoradId && (
                    <Box
                        sx={{
                            mb: 1,
                            pb: 1,
                            borderBottom: `1px solid ${alpha(theme.palette.border.main, 0.2)}`,
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {satelliteInfo?.data?.details?.image && (
                                <Box
                                    component="img"
                                    src={satelliteInfo.data.details.image}
                                    alt={satelliteInfo.data.details.name}
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 1,
                                        objectFit: 'cover',
                                    }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            )}
                            <Box sx={{ flex: 1 }}>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        fontWeight: 700,
                                        fontSize: '0.85rem',
                                        color: theme.palette.text.primary,
                                    }}
                                >
                                    {satelliteInfo?.data?.details?.name || (satelliteInfo?.error ? 'Unknown Satellite' : '-')}
                                    {satelliteInfo?.loading && (
                                        <CircularProgress size={12} sx={{ ml: 1 }} />
                                    )}
                                </Typography>
                                <Typography
                                    variant="caption"
                                    sx={{
                                        fontFamily: 'monospace',
                                        fontSize: '0.65rem',
                                        color: satelliteInfo?.error ? theme.palette.warning.main : theme.palette.text.secondary,
                                    }}
                                >
                                    NORAD {latestNoradId}
                                    {satelliteInfo?.data?.details?.sat_id && ` • ${satelliteInfo.data.details.sat_id}`}
                                    {satelliteInfo?.error && ' • Not in database'}
                                </Typography>
                            </Box>
                            <Tooltip title="Clear packets for this satellite" placement="top">
                                <IconButton
                                    size="small"
                                    onClick={handleClearSatellite}
                                    sx={{
                                        pointerEvents: 'auto',
                                        width: 24,
                                        height: 24,
                                        opacity: 0.5,
                                        transition: 'opacity 0.2s',
                                        '&:hover': {
                                            opacity: 1,
                                            backgroundColor: alpha(theme.palette.error.main, 0.1),
                                        },
                                    }}
                                >
                                    <ClearIcon sx={{ fontSize: 16, color: theme.palette.text.secondary }} />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>
                )}

                {/* Packets Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography
                        variant="caption"
                        sx={{
                            fontWeight: 600,
                            color: theme.palette.text.secondary,
                            textTransform: 'uppercase',
                            letterSpacing: 0.5,
                            fontSize: '0.65rem',
                        }}
                    >
                        Recent Packets
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.6rem',
                            color: theme.palette.text.disabled,
                        }}
                    >
                        {recentPackets.length} packet{recentPackets.length !== 1 ? 's' : ''}
                    </Typography>
                </Box>

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
                                color: theme.palette.text.disabled,
                                fontWeight: 600,
                                minWidth: 20,
                            }}
                        >
                            #{packet.packetNumber}
                        </Typography>

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
                        </Box>
                    </Box>
                ))}
            </Box>
        </Box>
    );
};

export default DecodedPacketsOverlay;
