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

import React from 'react';
import { useSelector } from 'react-redux';
import {
    Card,
    CardContent,
    Typography,
    Box,
    Stack,
    LinearProgress,
    useTheme,
    Grid,
} from '@mui/material';
import MemoryIcon from '@mui/icons-material/Memory';
import StorageIcon from '@mui/icons-material/Storage';
import ComputerIcon from '@mui/icons-material/Computer';

const SystemInfoCard = () => {
    const theme = useTheme();
    const versionInfo = useSelector((state) => state.version?.data);
    const systemInfo = versionInfo?.system;

    if (!systemInfo) {
        return (
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        System Information
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        System information not available
                    </Typography>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardContent>
                <Typography variant="h6" gutterBottom>
                    System Information
                </Typography>

                <Grid container spacing={3}>
                    {/* CPU Information */}
                    {systemInfo.cpu && (
                        <Grid size={12} md={6}>
                            <Card elevation={0} sx={{ p: 2, backgroundColor: 'rgba(33, 150, 243, 0.05)', border: `1px solid ${theme.palette.primary.main}20` }}>
                                <Stack spacing={2}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <MemoryIcon color="primary" fontSize="small" />
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            CPU
                                        </Typography>
                                    </Stack>
                                    
                                    <Stack spacing={1}>
                                        {systemInfo.cpu.processor && (
                                            <Box>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                    Processor
                                                </Typography>
                                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                    {systemInfo.cpu.processor}
                                                </Typography>
                                            </Box>
                                        )}
                                        
                                        {systemInfo.cpu.architecture && (
                                            <Box>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                    Architecture
                                                </Typography>
                                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                    {systemInfo.cpu.architecture}
                                                </Typography>
                                            </Box>
                                        )}
                                        
                                        {systemInfo.cpu.cores && (
                                            <Box>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                    Cores
                                                </Typography>
                                                <Typography variant="body2">
                                                    {systemInfo.cpu.cores.physical} physical, {systemInfo.cpu.cores.logical} logical
                                                </Typography>
                                            </Box>
                                        )}
                                        
                                        {systemInfo.cpu.usage_percent !== null && (
                                            <Box>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                        Usage
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                                        {systemInfo.cpu.usage_percent.toFixed(1)}%
                                                    </Typography>
                                                </Stack>
                                                <LinearProgress 
                                                    variant="determinate" 
                                                    value={systemInfo.cpu.usage_percent} 
                                                    sx={{ 
                                                        height: 6, 
                                                        borderRadius: 1,
                                                        backgroundColor: 'rgba(0,0,0,0.1)',
                                                        '& .MuiLinearProgress-bar': {
                                                            backgroundColor: systemInfo.cpu.usage_percent > 80 ? theme.palette.error.main : 
                                                                           systemInfo.cpu.usage_percent > 60 ? theme.palette.warning.main : 
                                                                           theme.palette.success.main
                                                        }
                                                    }}
                                                />
                                            </Box>
                                        )}
                                    </Stack>
                                </Stack>
                            </Card>
                        </Grid>
                    )}

                    {/* Memory Information */}
                    {systemInfo.memory && (
                        <Grid size={12} md={6}>
                            <Card elevation={0} sx={{ p: 2, backgroundColor: 'rgba(156, 39, 176, 0.05)', border: `1px solid ${theme.palette.secondary.main}20` }}>
                                <Stack spacing={2}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <MemoryIcon color="secondary" fontSize="small" />
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            Memory
                                        </Typography>
                                    </Stack>
                                    
                                    <Stack spacing={1}>
                                        {systemInfo.memory.total_gb && (
                                            <Box>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                    Total
                                                </Typography>
                                                <Typography variant="body2">
                                                    {systemInfo.memory.total_gb.toFixed(2)} GB
                                                </Typography>
                                            </Box>
                                        )}
                                        
                                        {systemInfo.memory.available_gb !== null && (
                                            <Box>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                    Available
                                                </Typography>
                                                <Typography variant="body2">
                                                    {systemInfo.memory.available_gb.toFixed(2)} GB
                                                </Typography>
                                            </Box>
                                        )}
                                        
                                        {systemInfo.memory.usage_percent !== null && (
                                            <Box>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                        Usage
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                                        {systemInfo.memory.usage_percent.toFixed(1)}%
                                                    </Typography>
                                                </Stack>
                                                <LinearProgress 
                                                    variant="determinate" 
                                                    value={systemInfo.memory.usage_percent} 
                                                    sx={{ 
                                                        height: 6, 
                                                        borderRadius: 1,
                                                        backgroundColor: 'rgba(0,0,0,0.1)',
                                                        '& .MuiLinearProgress-bar': {
                                                            backgroundColor: systemInfo.memory.usage_percent > 80 ? theme.palette.error.main : 
                                                                           systemInfo.memory.usage_percent > 60 ? theme.palette.warning.main : 
                                                                           theme.palette.success.main
                                                        }
                                                    }}
                                                />
                                            </Box>
                                        )}
                                    </Stack>
                                </Stack>
                            </Card>
                        </Grid>
                    )}

                    {/* Disk Information */}
                    {systemInfo.disk && (
                        <Grid size={12} md={6}>
                            <Card elevation={0} sx={{ p: 2, backgroundColor: 'rgba(255, 152, 0, 0.05)', border: `1px solid ${theme.palette.warning.main}20` }}>
                                <Stack spacing={2}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <StorageIcon color="warning" fontSize="small" />
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            Disk
                                        </Typography>
                                    </Stack>
                                    
                                    <Stack spacing={1}>
                                        {systemInfo.disk.total_gb && (
                                            <Box>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                    Total
                                                </Typography>
                                                <Typography variant="body2">
                                                    {systemInfo.disk.total_gb.toFixed(2)} GB
                                                </Typography>
                                            </Box>
                                        )}
                                        
                                        {systemInfo.disk.available_gb !== null && (
                                            <Box>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                    Available
                                                </Typography>
                                                <Typography variant="body2">
                                                    {systemInfo.disk.available_gb.toFixed(2)} GB
                                                </Typography>
                                            </Box>
                                        )}
                                        
                                        {systemInfo.disk.usage_percent !== null && (
                                            <Box>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                        Usage
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                                        {systemInfo.disk.usage_percent.toFixed(1)}%
                                                    </Typography>
                                                </Stack>
                                                <LinearProgress 
                                                    variant="determinate" 
                                                    value={systemInfo.disk.usage_percent} 
                                                    sx={{ 
                                                        height: 6, 
                                                        borderRadius: 1,
                                                        backgroundColor: 'rgba(0,0,0,0.1)',
                                                        '& .MuiLinearProgress-bar': {
                                                            backgroundColor: systemInfo.disk.usage_percent > 80 ? theme.palette.error.main : 
                                                                           systemInfo.disk.usage_percent > 60 ? theme.palette.warning.main : 
                                                                           theme.palette.success.main
                                                        }
                                                    }}
                                                />
                                            </Box>
                                        )}
                                    </Stack>
                                </Stack>
                            </Card>
                        </Grid>
                    )}

                    {/* Operating System Information */}
                    {systemInfo.os && (
                        <Grid size={12} md={6}>
                            <Card elevation={0} sx={{ p: 2, backgroundColor: 'rgba(76, 175, 80, 0.05)', border: `1px solid ${theme.palette.success.main}20` }}>
                                <Stack spacing={2}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <ComputerIcon color="success" fontSize="small" />
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            Operating System
                                        </Typography>
                                    </Stack>
                                    
                                    <Stack spacing={1}>
                                        {systemInfo.os.system && (
                                            <Box>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                    System
                                                </Typography>
                                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                    {systemInfo.os.system}
                                                </Typography>
                                            </Box>
                                        )}
                                        
                                        {systemInfo.os.release && (
                                            <Box>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                    Release
                                                </Typography>
                                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                    {systemInfo.os.release}
                                                </Typography>
                                            </Box>
                                        )}
                                        
                                        {systemInfo.os.version && (
                                            <Box>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                                    Version
                                                </Typography>
                                                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
                                                    {systemInfo.os.version}
                                                </Typography>
                                            </Box>
                                        )}
                                    </Stack>
                                </Stack>
                            </Card>
                        </Grid>
                    )}
                </Grid>
            </CardContent>
        </Card>
    );
};

export default SystemInfoCard;
