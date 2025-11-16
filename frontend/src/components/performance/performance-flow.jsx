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

import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    useReactFlow,
    Panel,
    ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Box, Button } from '@mui/material';
import { ComponentNode } from './flow-node.jsx';
import { createFlowFromMetrics } from './flow-layout.js';
import dagre from 'dagre';

const nodeTypes = {
    componentNode: ComponentNode,
};

// Dagre layout configuration
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes, edges, direction = 'LR') => {
    const nodeWidth = 300;
    const nodeHeight = 200;
    const isHorizontal = direction === 'LR';

    dagreGraph.setGraph({ rankdir: direction, nodesep: 100, ranksep: 250 });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeHeight / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
};

const FlowContent = ({ metrics }) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const initializedRef = useRef(false);
    const autoArrangedRef = useRef(false);
    const { fitView } = useReactFlow();

    // Convert metrics to nodes and edges
    const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
        if (!metrics) return { nodes: [], edges: [] };
        return createFlowFromMetrics(metrics);
    }, [metrics]);

    // Update nodes and edges when metrics change
    useEffect(() => {
        if (!initializedRef.current) {
            // First time: set positions from layout algorithm
            setNodes(flowNodes);
            setEdges(flowEdges);
            initializedRef.current = true;
        } else {
            // Subsequent updates: preserve user positions, only update data
            setNodes((currentNodes) =>
                currentNodes.map((node) => {
                    const newNode = flowNodes.find((n) => n.id === node.id);
                    if (newNode) {
                        // Keep user's position, update only the data
                        return {
                            ...node,
                            data: newNode.data,
                        };
                    }
                    return node;
                })
            );

            // Update edges (they don't have user-modified positions)
            setEdges(flowEdges);
        }
    }, [flowNodes, flowEdges, setNodes, setEdges]);

    // Auto-arrange handler
    const onAutoArrange = useCallback(() => {
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges);
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);

        // Fit view after layout with a small delay
        window.requestAnimationFrame(() => {
            fitView({ padding: 0.2, duration: 300 });
        });
    }, [nodes, edges, setNodes, setEdges, fitView]);

    // Auto-arrange on first load
    useEffect(() => {
        if (nodes.length > 0 && !autoArrangedRef.current) {
            autoArrangedRef.current = true;
            // Small delay to ensure nodes are rendered
            setTimeout(() => {
                onAutoArrange();
            }, 100);
        }
    }, [nodes.length, onAutoArrange]);

    return (
        <Box
            sx={{
                width: '100%',
                height: '100%',
                backgroundColor: (theme) => theme.palette.background?.default || theme.palette.background.default,
            }}
        >
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                fitView
                attributionPosition="bottom-left"
            >
                <Background
                    color="#888"
                    gap={16}
                    variant="dots"
                />
                <Controls />
                <MiniMap
                    nodeColor={(node) => {
                        if (!node.data?.component?.is_alive) return '#999';
                        switch (node.data?.type) {
                            case 'broadcaster': return '#2196f3';
                            case 'fft': return '#9c27b0';
                            case 'demodulator': return '#4caf50';
                            case 'recorder': return '#f44336';
                            case 'decoder': return '#ff9800';
                            case 'streamer': return '#00bcd4';
                            default: return '#888';
                        }
                    }}
                    maskColor="rgba(0, 0, 0, 0.6)"
                />
                <Panel position="top-right">
                    <Button
                        variant="contained"
                        size="small"
                        onClick={onAutoArrange}
                        sx={{ boxShadow: 2 }}
                    >
                        Auto Arrange
                    </Button>
                </Panel>
            </ReactFlow>
        </Box>
    );
};

const PerformanceFlow = ({ metrics }) => {
    return (
        <ReactFlowProvider>
            <FlowContent metrics={metrics} />
        </ReactFlowProvider>
    );
};

export default PerformanceFlow;
