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

import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    Tabs,
    Tab,
    Grid,
    Card,
    CardMedia,
    CardContent,
    Chip,
    IconButton,
    Divider,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableRow,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import ImageIcon from '@mui/icons-material/Image';
import FolderIcon from '@mui/icons-material/Folder';

function TabPanel({ children, value, index }) {
    return (
        <div hidden={value !== index}>
            {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
        </div>
    );
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function getImageTitle(filename) {
    const baseName = filename.replace(/\.png$/i, '');
    const rawChannelMatch = baseName.match(/^MSU-MR-(\d)$/);
    if (rawChannelMatch) {
        return `Raw Channel ${rawChannelMatch[1]}`;
    }

    const isCorrected = baseName.includes('_corrected');
    const isMap = baseName.includes('_map');
    let label = baseName.replace(/_corrected/g, '').replace(/_map/g, '');

    if (label.includes('3.9_um')) {
        label = 'Shortwave IR 3.9um';
    } else if (label.startsWith('msu_mr_rgb_')) {
        label = label.replace(/^msu_mr_rgb_/, '').replace(/_/g, ' ');
        if (!/false color/i.test(label)) {
            label = `${label} Composite`;
        }
    } else {
        label = label.replace(/_/g, ' ');
    }

    const suffixParts = [];
    if (isCorrected) suffixParts.push('Corrected');
    if (isMap) suffixParts.push('Map');

    return suffixParts.length > 0 ? `${label} (${suffixParts.join(' ')})` : label;
}

export default function MeteorFolderDialog({ open, onClose, folder }) {
    const [activeTab, setActiveTab] = useState(0);
    const [selectedImage, setSelectedImage] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const pointerStartRef = useRef({ x: 0, y: 0 });
    const zoomContainerRef = useRef(null);

    // Reset activeTab when folder changes or dialog opens
    useEffect(() => {
        if (open) {
            setActiveTab(0);
            setSelectedImage(null);
        }
    }, [open, folder?.foldername]);

    useEffect(() => {
        if (selectedImage) {
            setZoom(1);
            setPan({ x: 0, y: 0 });
            setIsPanning(false);
        }
    }, [selectedImage]);

    if (!folder) return null;

    // Categorize images by type
    const rawChannels = folder.images?.filter(img => /MSU-MR-\d\.png$/.test(img.filename)) || [];
    const rgbComposites = folder.images?.filter(img =>
        img.filename.includes('rgb_') &&
        !img.filename.includes('_map') &&
        !img.filename.includes('_corrected')
    ) || [];
    const irImages = folder.images?.filter(img => img.filename.includes('3.9_um')) || [];
    const mapProjections = folder.images?.filter(img => img.filename.endsWith('_map.png')) || [];
    const corrected = folder.images?.filter(img =>
        img.filename.includes('_corrected') &&
        !img.filename.includes('_map')
    ) || [];

    const categories = [
        { label: 'RGB Composites', images: rgbComposites },
        { label: 'Map Projections', images: mapProjections },
        { label: 'Corrected', images: corrected },
        { label: 'IR Images', images: irImages },
        { label: 'Raw Channels', images: rawChannels },
        { label: 'All Images', images: folder.images || [] },
        { label: 'Metadata', images: null, isMetadata: true },
    ].filter(cat => cat.isMetadata || (cat.images && cat.images.length > 0));

    const handleDownloadFolder = () => {
        // Download all images - open each in a new tab with slight delay
        folder.images?.forEach((img, idx) => {
            setTimeout(() => {
                window.open(img.url, '_blank');
            }, idx * 100);
        });
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const getPanBounds = (zoomValue) => {
        if (!zoomContainerRef.current) {
            return { maxX: 0, maxY: 0 };
        }
        const rect = zoomContainerRef.current.getBoundingClientRect();
        const maxX = Math.max(0, (zoomValue - 1) * rect.width / 2);
        const maxY = Math.max(0, (zoomValue - 1) * rect.height / 2);
        return { maxX, maxY };
    };

    const clampPan = (nextPan, zoomValue) => {
        if (zoomValue <= 1) {
            return { x: 0, y: 0 };
        }
        const { maxX, maxY } = getPanBounds(zoomValue);
        return {
            x: clamp(nextPan.x, -maxX, maxX),
            y: clamp(nextPan.y, -maxY, maxY),
        };
    };

    const handleZoom = (event) => {
        event.preventDefault();
        if (!selectedImage) return;
        const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
        const nextZoom = clamp(zoom * zoomFactor, 1, 6);
        setZoom(nextZoom);
        setPan((prev) => clampPan(prev, nextZoom));
    };

    const handlePointerDown = (event) => {
        if (!selectedImage) return;
        if (event.pointerType !== 'touch' && event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsPanning(true);
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
        panStartRef.current = { ...pan };
    };

    const handlePointerMove = (event) => {
        if (!isPanning) return;
        const dx = event.clientX - pointerStartRef.current.x;
        const dy = event.clientY - pointerStartRef.current.y;
        setPan(clampPan({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy }, zoom));
    };

    const handlePointerUp = (event) => {
        if (!isPanning) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setIsPanning(false);
    };

    return (
        <>
            <Dialog
                open={open}
                onClose={onClose}
                maxWidth="xl"
                fullWidth
                PaperProps={{
                    sx: {
                        height: '90vh',
                        maxHeight: '90vh',
                    }
                }}
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <SatelliteAltIcon color="primary" />
                                <Typography variant="h6">
                                    {folder.satellite_name || 'METEOR Satellite'}
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                {folder.foldername}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Chip
                                label={`${folder.image_count} images`}
                                icon={<ImageIcon />}
                                color="success"
                                size="small"
                            />
                            {folder.pipeline && (
                                <Chip
                                    label={folder.pipeline.toUpperCase()}
                                    color="info"
                                    size="small"
                                />
                            )}
                            <Chip
                                label={formatBytes(folder.size)}
                                size="small"
                                variant="outlined"
                            />
                            <IconButton onClick={onClose}>
                                <CloseIcon />
                            </IconButton>
                        </Box>
                    </Box>
                </DialogTitle>

                <Divider />

                {categories.length > 0 && (
                    <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
                        <Tabs
                            value={activeTab}
                            onChange={(e, v) => setActiveTab(v)}
                            variant="scrollable"
                            scrollButtons="auto"
                        >
                            {categories.map((cat, idx) => (
                                <Tab key={idx} label={cat.isMetadata ? cat.label : `${cat.label} (${cat.images.length})`} />
                            ))}
                        </Tabs>
                    </Box>
                )}

                <DialogContent sx={{ overflow: 'auto', flex: 1 }}>
                    {categories.length === 0 ? (
                        <Box sx={{ textAlign: 'center', py: 8 }}>
                            <FolderIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                            <Typography variant="h6" color="text.secondary">
                                No images found in this folder
                            </Typography>
                        </Box>
                    ) : (
                        categories.map((category, catIdx) => (
                            <TabPanel key={catIdx} value={activeTab} index={catIdx}>
                                {category.isMetadata ? (
                                    <Box sx={{ px: 2 }}>
                                        {/* Dataset Information */}
                                        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <SatelliteAltIcon color="primary" />
                                            Dataset Information
                                        </Typography>
                                        <TableContainer component={Paper} sx={{ mb: 3 }}>
                                            <Table size="small">
                                                <TableBody>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 600 }}>Satellite</TableCell>
                                                        <TableCell>{folder.metadata?.satellite || folder.satellite_name || 'Unknown'}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 600 }}>Timestamp</TableCell>
                                                        <TableCell>
                                                            {folder.metadata?.timestamp
                                                                ? new Date(folder.metadata.timestamp * 1000).toLocaleString()
                                                                : folder.timestamp || 'N/A'}
                                                        </TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 600 }}>Products</TableCell>
                                                        <TableCell>{folder.products?.join(', ') || 'N/A'}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 600 }}>Pipeline</TableCell>
                                                        <TableCell>{folder.pipeline || 'N/A'}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 600 }}>Total Images</TableCell>
                                                        <TableCell>{folder.image_count}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 600 }}>Total Size</TableCell>
                                                        <TableCell>{formatBytes(folder.size)}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 600 }}>CADU Data</TableCell>
                                                        <TableCell>{folder.has_cadu ? 'Yes' : 'No'}</TableCell>
                                                    </TableRow>
                                                    <TableRow>
                                                        <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                                                        <TableCell>{new Date(folder.created).toLocaleString()}</TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                        </TableContainer>

                                        {/* Telemetry Section */}
                                        {folder.telemetry && (
                                            <>
                                                <Typography variant="h6" sx={{ mb: 2, mt: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <ImageIcon color="success" />
                                                    Telemetry Data
                                                </Typography>
                                                <TableContainer component={Paper}>
                                                    <Table size="small">
                                                        <TableBody>
                                                            {folder.telemetry.msu_mr_id !== undefined && (
                                                                <TableRow>
                                                                    <TableCell sx={{ fontWeight: 600 }}>MSU-MR ID</TableCell>
                                                                    <TableCell>{folder.telemetry.msu_mr_id}</TableCell>
                                                                </TableRow>
                                                            )}
                                                            {folder.telemetry.msu_mr_set && (
                                                                <TableRow>
                                                                    <TableCell sx={{ fontWeight: 600 }}>MSU-MR Set</TableCell>
                                                                    <TableCell>{folder.telemetry.msu_mr_set}</TableCell>
                                                                </TableRow>
                                                            )}
                                                            {folder.telemetry.digital_tlm && Object.entries(folder.telemetry.digital_tlm).map(([key, value]) => (
                                                                <TableRow key={key}>
                                                                    <TableCell sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                                                                        {key.replace(/_/g, ' ')}
                                                                    </TableCell>
                                                                    <TableCell>{String(value)}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            </>
                                        )}
                                    </Box>
                                ) : (
                                    <Grid container spacing={2}>
                                        {category.images.map((image, imgIdx) => {
                                            const title = getImageTitle(image.filename);

                                            return (
                                                <Grid item xs={12} sm={6} md={4} lg={3} key={imgIdx}>
                                                    <Card
                                                        sx={{
                                                            cursor: 'pointer',
                                                            '&:hover': { boxShadow: 4 },
                                                            height: '100%',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                        }}
                                                        onClick={() => setSelectedImage(image)}
                                                    >
                                                        <CardMedia
                                                            component="img"
                                                            height="200"
                                                            image={image.url}
                                                            alt={image.filename}
                                                            sx={{ objectFit: 'cover' }}
                                                        />
                                                        <CardContent sx={{ pb: 1, flexGrow: 1 }}>
                                                            <Typography
                                                                variant="subtitle2"
                                                                noWrap
                                                                title={title}
                                                            >
                                                                {title}
                                                            </Typography>
                                                            <Typography
                                                                variant="body2"
                                                                noWrap
                                                                title={image.filename}
                                                                sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                                                            >
                                                                {image.filename}
                                                            </Typography>
                                                            <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                                                                {image.width && image.height && (
                                                                    <Chip
                                                                        label={`${image.width}×${image.height}`}
                                                                        size="small"
                                                                        variant="outlined"
                                                                        sx={{ height: '18px', fontSize: '0.65rem' }}
                                                                    />
                                                                )}
                                                                <Chip
                                                                    label={formatBytes(image.size)}
                                                                    size="small"
                                                                    variant="outlined"
                                                                    sx={{ height: '18px', fontSize: '0.65rem' }}
                                                                />
                                                            </Box>
                                                        </CardContent>
                                                    </Card>
                                                </Grid>
                                            );
                                        })}
                                    </Grid>
                                )}
                            </TabPanel>
                        ))
                    )}
                </DialogContent>

                <DialogActions>
                    {folder.images && folder.images.length > 0 && (
                        <Button onClick={handleDownloadFolder} startIcon={<DownloadIcon />}>
                            Download All ({folder.image_count})
                        </Button>
                    )}
                    <Button onClick={onClose}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Full-size image preview dialog */}
            {selectedImage && (
                <Dialog
                    open={!!selectedImage}
                    onClose={() => setSelectedImage(null)}
                    maxWidth="lg"
                    fullWidth
                >
                    <DialogTitle>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                                {selectedImage.filename}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                {selectedImage.width && selectedImage.height && (
                                    <Chip
                                        label={`${selectedImage.width}×${selectedImage.height}`}
                                        size="small"
                                        variant="outlined"
                                    />
                                )}
                                <Chip
                                    label={formatBytes(selectedImage.size)}
                                    size="small"
                                    variant="outlined"
                                />
                                <IconButton onClick={() => setSelectedImage(null)}>
                                    <CloseIcon />
                                </IconButton>
                            </Box>
                        </Box>
                    </DialogTitle>
                    <DialogContent
                        sx={{
                            textAlign: 'center',
                            overflow: 'hidden',
                            backgroundColor: 'black',
                            p: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: 400,
                            height: '70vh',
                            touchAction: 'none',
                        }}
                        ref={zoomContainerRef}
                        onWheel={handleZoom}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        onDoubleClick={() => {
                            setZoom(1);
                            setPan({ x: 0, y: 0 });
                        }}
                    >
                        <img
                            src={selectedImage.url}
                            alt={selectedImage.filename}
                            draggable={false}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                transformOrigin: 'center center',
                                cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
                            }}
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button
                            onClick={() => window.open(selectedImage.url, '_blank')}
                            startIcon={<DownloadIcon />}
                        >
                            Download
                        </Button>
                        <Button onClick={() => setSelectedImage(null)}>Close</Button>
                    </DialogActions>
                </Dialog>
            )}
        </>
    );
}
