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

/**
 * Convert performance metrics to ReactFlow nodes and edges
 */
export const createFlowFromMetrics = (metrics) => {
    const nodes = [];
    const edges = [];

    let nodeIdCounter = 0;
    const nodeMap = new Map(); // Track node IDs for creating edges

    // Layout configuration - increased spacing to prevent overlap
    const HORIZONTAL_SPACING = 450;
    const VERTICAL_SPACING = 280;
    const START_X = 50;
    const START_Y = 50;

    // Process each SDR
    if (metrics.sdrs) {
        Object.entries(metrics.sdrs).forEach(([sdrId, sdrData], sdrIndex) => {
            const sdrStartY = START_Y + (sdrIndex * 1000); // Stack SDRs vertically
            let columnX = START_X;

            // Column 0: IQ Broadcaster
            if (sdrData.broadcasters) {
                Object.entries(sdrData.broadcasters).forEach(([broadcasterId, broadcaster]) => {
                    if (broadcaster.broadcaster_type === 'iq') {
                        const nodeId = `node-${nodeIdCounter++}`;
                        nodeMap.set(`${sdrId}-iq-broadcaster`, nodeId);

                        nodes.push({
                            id: nodeId,
                            type: 'componentNode',
                            position: { x: columnX, y: sdrStartY },
                            data: {
                                label: `IQ Broadcaster - ${sdrId}`,
                                component: broadcaster,
                                type: 'broadcaster',
                            },
                        });
                    }
                });
            }

            // Column 1: FFT Processor
            columnX += HORIZONTAL_SPACING;
            if (sdrData.fft_processor) {
                const nodeId = `node-${nodeIdCounter++}`;
                nodeMap.set(`${sdrId}-fft`, nodeId);

                nodes.push({
                    id: nodeId,
                    type: 'componentNode',
                    position: { x: columnX, y: sdrStartY },
                    data: {
                        label: `FFT Processor - ${sdrId}`,
                        component: sdrData.fft_processor,
                        type: 'fft',
                    },
                });

                // Edge: IQ Broadcaster -> FFT Processor
                const iqBroadcasterId = nodeMap.get(`${sdrId}-iq-broadcaster`);
                if (iqBroadcasterId) {
                    edges.push({
                        id: `edge-${iqBroadcasterId}-${nodeId}`,
                        source: iqBroadcasterId,
                        target: nodeId,
                        animated: true,
                        style: { stroke: '#4caf50', strokeWidth: 2 },
                    });
                }
            }

            // Column 2: Demodulators & Recorders (stacked vertically)
            columnX += HORIZONTAL_SPACING;
            let demodY = sdrStartY - 100;

            // Demodulators
            if (sdrData.demodulators) {
                Object.entries(sdrData.demodulators).forEach(([demodKey, demod]) => {
                    const nodeId = `node-${nodeIdCounter++}`;
                    nodeMap.set(`${sdrId}-demod-${demodKey}`, nodeId);

                    nodes.push({
                        id: nodeId,
                        type: 'componentNode',
                        position: { x: columnX, y: demodY },
                        data: {
                            label: `${demod.type} - ${demodKey}`,
                            component: demod,
                            type: 'demodulator',
                        },
                    });

                    // Edge: IQ Broadcaster -> Demodulator
                    const iqBroadcasterId = nodeMap.get(`${sdrId}-iq-broadcaster`);
                    if (iqBroadcasterId) {
                        const queueUtilization = demod.input_queue_size / Math.max(demod.input_queue_maxsize || 10, 1);
                        const edgeColor = queueUtilization > 0.8 ? '#f44336' : queueUtilization > 0.5 ? '#ff9800' : '#4caf50';

                        edges.push({
                            id: `edge-${iqBroadcasterId}-${nodeId}`,
                            source: iqBroadcasterId,
                            target: nodeId,
                            animated: demod.is_alive,
                            style: { stroke: edgeColor, strokeWidth: 2 },
                            label: demod.input_queue_size ? `${demod.input_queue_size}` : undefined,
                        });
                    }

                    demodY += VERTICAL_SPACING;
                });
            }

            // Audio Broadcasters (after demodulators, column 3)
            columnX += HORIZONTAL_SPACING;
            let audioBroadcasterY = sdrStartY - 100;

            if (sdrData.broadcasters) {
                Object.entries(sdrData.broadcasters).forEach(([broadcasterId, broadcaster]) => {
                    if (broadcaster.broadcaster_type === 'audio') {
                        const nodeId = `node-${nodeIdCounter++}`;
                        const audioKey = `${broadcaster.session_id}_${broadcaster.decoder_name}`;
                        nodeMap.set(`${sdrId}-audio-broadcaster-${audioKey}`, nodeId);

                        nodes.push({
                            id: nodeId,
                            type: 'componentNode',
                            position: { x: columnX, y: audioBroadcasterY },
                            data: {
                                label: `Audio Broadcaster - ${broadcaster.session_id}`,
                                component: broadcaster,
                                type: 'broadcaster',
                            },
                        });

                        // Edge: Demodulator -> Audio Broadcaster
                        // Use connections data from broadcaster
                        const sourceConnection = broadcaster.connections?.find(c => c.source_type === 'demodulator');
                        if (sourceConnection) {
                            // The source_id is the full demodulator key (e.g., "-WClwJW9jcoFpBTGAAAV_vfo1")
                            const demodKey = `${sdrId}-demod-${sourceConnection.source_id}`;
                            const demodId = nodeMap.get(demodKey);

                            if (demodId) {
                                edges.push({
                                    id: `edge-${demodId}-${nodeId}`,
                                    source: demodId,
                                    target: nodeId,
                                    animated: broadcaster.is_alive,
                                    style: { stroke: '#4caf50', strokeWidth: 2 },
                                });
                            }
                        }

                        // Store audio broadcaster node ID for later connection to WebAudioStreamer
                        const audioBroadcasterNodeId = nodeId;

                        // We'll connect to WebAudioStreamer after all nodes are created
                        // Store reference for later (we'll process this after the main loop)
                        if (!nodeMap.has('pending-audio-broadcaster-edges')) {
                            nodeMap.set('pending-audio-broadcaster-edges', []);
                        }
                        nodeMap.get('pending-audio-broadcaster-edges').push({
                            audioBroadcasterId: audioBroadcasterNodeId,
                            broadcaster: broadcaster,
                        });

                        audioBroadcasterY += VERTICAL_SPACING;
                    }
                });
            }

            // Recorders (below demodulators)
            if (sdrData.recorders) {
                Object.entries(sdrData.recorders).forEach(([recKey, recorder]) => {
                    const nodeId = `node-${nodeIdCounter++}`;
                    nodeMap.set(`${sdrId}-recorder-${recKey}`, nodeId);

                    nodes.push({
                        id: nodeId,
                        type: 'componentNode',
                        position: { x: columnX, y: demodY },
                        data: {
                            label: `${recorder.type} - ${recKey}`,
                            component: recorder,
                            type: 'recorder',
                        },
                    });

                    // Edge: IQ Broadcaster -> Recorder
                    const iqBroadcasterId = nodeMap.get(`${sdrId}-iq-broadcaster`);
                    if (iqBroadcasterId) {
                        const queueUtilization = recorder.input_queue_size / Math.max(recorder.input_queue_maxsize || 10, 1);
                        const edgeColor = queueUtilization > 0.8 ? '#f44336' : queueUtilization > 0.5 ? '#ff9800' : '#4caf50';

                        edges.push({
                            id: `edge-${iqBroadcasterId}-${nodeId}`,
                            source: iqBroadcasterId,
                            target: nodeId,
                            animated: recorder.is_alive,
                            style: { stroke: edgeColor, strokeWidth: 2 },
                            label: recorder.input_queue_size ? `${recorder.input_queue_size}` : undefined,
                        });
                    }

                    demodY += VERTICAL_SPACING;
                });
            }

            // Column 4: Decoders (after audio broadcasters)
            if (sdrData.decoders) {
                columnX += HORIZONTAL_SPACING;
                let decoderY = sdrStartY - 100;

                Object.entries(sdrData.decoders).forEach(([decKey, decoder]) => {
                    const nodeId = `node-${nodeIdCounter++}`;

                    nodes.push({
                        id: nodeId,
                        type: 'componentNode',
                        position: { x: columnX, y: decoderY },
                        data: {
                            label: `${decoder.type} - ${decKey}`,
                            component: decoder,
                            type: 'decoder',
                        },
                    });

                    // Connect from audio broadcaster
                    // Extract session_id and vfo from decoder key (e.g., "de6TGRr9dWAMVx39AAAS_vfo1")
                    const parts = decKey.split('_vfo');
                    if (parts.length === 2) {
                        const sessionId = parts[0];
                        const vfoNum = parts[1];
                        const audioBroadcasterId = nodeMap.get(`${sdrId}-audio-broadcaster-${sessionId}_${vfoNum}`);

                        if (audioBroadcasterId) {
                            const queueUtilization = decoder.input_queue_size / Math.max(decoder.input_queue_maxsize || 10, 1);
                            const edgeColor = queueUtilization > 0.8 ? '#f44336' : queueUtilization > 0.5 ? '#ff9800' : '#4caf50';

                            edges.push({
                                id: `edge-${audioBroadcasterId}-${nodeId}`,
                                source: audioBroadcasterId,
                                target: nodeId,
                                animated: decoder.is_alive,
                                style: { stroke: edgeColor, strokeWidth: 2 },
                                label: decoder.input_queue_size ? `${decoder.input_queue_size}` : undefined,
                            });
                        }
                    }

                    decoderY += VERTICAL_SPACING;
                });
            }
        });
    }

    // Audio Streamers (global, at the bottom)
    if (metrics.audio_streamers) {
        let streamerY = START_Y + (Object.keys(metrics.sdrs || {}).length * 1000);
        let streamerX = START_X + HORIZONTAL_SPACING * 2;

        Object.entries(metrics.audio_streamers).forEach(([key, streamer]) => {
            const nodeId = `node-${nodeIdCounter++}`;
            nodeMap.set(`audio-streamer-${key}`, nodeId);

            nodes.push({
                id: nodeId,
                type: 'componentNode',
                position: { x: streamerX, y: streamerY },
                data: {
                    label: streamer.type,
                    component: streamer,
                    type: 'streamer',
                },
            });

            streamerY += VERTICAL_SPACING;
        });
    }

    // Process pending audio broadcaster -> WebAudioStreamer edges
    const pendingEdges = nodeMap.get('pending-audio-broadcaster-edges');
    if (pendingEdges && pendingEdges.length > 0) {
        pendingEdges.forEach(({ audioBroadcasterId, broadcaster }) => {
            // Look for UI target in connections
            const uiConnection = broadcaster.connections?.find(c => c.target_type === 'ui');
            if (uiConnection) {
                // WebAudioStreamer is typically under the key 'web_audio'
                const webAudioStreamerId = nodeMap.get('audio-streamer-web_audio');
                if (webAudioStreamerId) {
                    edges.push({
                        id: `edge-${audioBroadcasterId}-${webAudioStreamerId}`,
                        source: audioBroadcasterId,
                        target: webAudioStreamerId,
                        animated: broadcaster.is_alive,
                        style: { stroke: '#00bcd4', strokeWidth: 2 },
                    });
                }
            }
        });
    }

    return { nodes, edges };
};
