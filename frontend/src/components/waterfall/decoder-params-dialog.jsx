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
import {
    Box,
    Dialog,
    DialogTitle,
    DialogContent,
    IconButton,
    Typography,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Switch,
    FormControlLabel,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { getDecoderParameters } from './vfo-config.js';

const DecoderParamsDialog = ({
    open,
    onClose,
    vfoIndex,
    vfoMarkers,
    vfoActive,
    onVFOPropertyChange,
}) => {
    if (!vfoIndex || !vfoMarkers[vfoIndex]) {
        return null;
    }

    const vfo = vfoMarkers[vfoIndex];
    const decoder = vfo.decoder;

    if (!decoder || decoder === 'none') {
        return null;
    }

    const decoderParams = getDecoderParameters(decoder);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    backgroundColor: 'background.elevated',
                }
            }}
        >
            <DialogTitle sx={{ backgroundColor: 'background.elevated', color: 'text.primary' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">
                        {decoder.toUpperCase()} Parameters
                    </Typography>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>
            <DialogContent dividers sx={{ p: 3, backgroundColor: 'background.elevated' }}>
                <Box>
                    {Object.entries(decoderParams).map(([paramKey, paramDef]) => {
                        const currentValue = vfo.parameters?.[paramKey] ?? paramDef.default;

                        return (
                            <Box key={paramKey} sx={{ mb: 2.5 }}>
                                {paramDef.type === 'select' && (
                                    <FormControl fullWidth size="small" variant="filled">
                                        <InputLabel>{paramDef.label}</InputLabel>
                                        <Select
                                            value={JSON.stringify(currentValue)}
                                            label={paramDef.label}
                                            disabled={!vfoActive[vfoIndex]}
                                            onChange={(e) => {
                                                // Parse the JSON string back to the original value
                                                const selectedValue = JSON.parse(e.target.value);
                                                onVFOPropertyChange(vfoIndex, {
                                                    parameters: {
                                                        ...vfo.parameters,
                                                        [paramKey]: selectedValue
                                                    }
                                                });
                                            }}
                                            sx={{ fontSize: '0.875rem' }}
                                        >
                                            {paramDef.options.map((opt, idx) => (
                                                <MenuItem
                                                    key={JSON.stringify(opt.value)}
                                                    value={JSON.stringify(opt.value)}
                                                    sx={{ fontSize: '0.875rem' }}
                                                >
                                                    {opt.label}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                        {paramDef.description && (
                                            <Typography variant="caption" sx={{ mt: 0.5, display: 'block', color: 'text.disabled', fontSize: '0.75rem' }}>
                                                {paramDef.description}
                                            </Typography>
                                        )}
                                    </FormControl>
                                )}

                                {paramDef.type === 'switch' && (
                                    <Box>
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={currentValue}
                                                    disabled={!vfoActive[vfoIndex]}
                                                    onChange={(e) => {
                                                        onVFOPropertyChange(vfoIndex, {
                                                            parameters: {
                                                                ...vfo.parameters,
                                                                [paramKey]: e.target.checked
                                                            }
                                                        });
                                                    }}
                                                />
                                            }
                                            label={
                                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                    {paramDef.label}
                                                </Typography>
                                            }
                                            sx={{ mt: 0, ml: 0 }}
                                        />
                                        {paramDef.description && (
                                            <Typography variant="caption" sx={{ ml: 0, display: 'block', color: 'text.disabled', fontSize: '0.75rem' }}>
                                                {paramDef.description}
                                            </Typography>
                                        )}
                                    </Box>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            </DialogContent>
        </Dialog>
    );
};

export default DecoderParamsDialog;
