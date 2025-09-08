import React from 'react';
import {
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from './settings-elements.jsx';
import Typography from '@mui/material/Typography';
import {
    Box,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    TextField,
} from "@mui/material";

import { humanizeFrequency } from "../common/common.jsx";
import FrequencyDisplay from "./frequency-dial.jsx";

const FrequencyControlAccordion = ({
                                       expanded,
                                       onAccordionChange,
                                       centerFrequency,
                                       onCenterFrequencyChange,
                                       availableTransmitters,
                                       getProperTransmitterId,
                                       onTransmitterChange,
                                       selectedOffsetMode,
                                       onOffsetModeChange,
                                       selectedOffsetValue,
                                       onOffsetValueChange,
                                   }) => {
    return (
        <Accordion expanded={expanded} onChange={onAccordionChange}>
            <AccordionSummary
                sx={{
                    boxShadow: '-1px 4px 7px #00000059',
                }}
                aria-controls="freq-content" id="freq-header">
                <Typography component="span">Frequency control</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{
                backgroundColor: 'rgb(34,34,34)',
            }}>
                <Box sx={{mb: 0, width: '100%'}}>
                    <FrequencyDisplay
                        initialFrequency={centerFrequency / 1000.0}
                        onChange={onCenterFrequencyChange}
                        size={"small"}
                        hideHzDigits={true}
                    />
                </Box>

                <FormControl disabled={false}
                             sx={{minWidth: 200, marginTop: 1, marginBottom: 0}} fullWidth variant="filled"
                             size="small">
                    <InputLabel htmlFor="transmitter-select">Go to transmitter</InputLabel>
                    <Select
                        id="transmitter-select"
                        value={getProperTransmitterId()}
                        onChange={onTransmitterChange}
                        variant={'filled'}>
                        <MenuItem value="none">
                            [no frequency selected]
                        </MenuItem>
                        <MenuItem value="" disabled>
                            <em>select a transmitter</em>
                        </MenuItem>
                        {availableTransmitters.map((transmitter) => {
                            return <MenuItem value={transmitter.id} key={transmitter.id}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box
                                        sx={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            backgroundColor: transmitter.alive ? '#4caf50' : '#f44336',
                                            boxShadow: transmitter.alive
                                                ? '0 0 6px rgba(76, 175, 80, 0.6)'
                                                : '0 0 6px rgba(244, 67, 54, 0.6)',
                                        }}
                                    />
                                    <span>
                                        {transmitter['description']} ({humanizeFrequency(transmitter['downlink_low'])})
                                    </span>
                                </Box>
                            </MenuItem>;
                        })}
                    </Select>
                </FormControl>

                <FormControl
                    disabled={false}
                    sx={{minWidth: 200, marginTop: 1, marginBottom: 0}}
                    fullWidth
                    variant="filled"
                    size="small">
                    <InputLabel htmlFor="frequency-offset-select">Frequency Offset</InputLabel>
                    <Select
                        id="frequency-offset-select"
                        value={selectedOffsetMode || "none"}
                        onChange={onOffsetModeChange}
                        variant={'filled'}>
                        <MenuItem value="none">
                            [no frequency offset]
                        </MenuItem>
                        <MenuItem value="manual">Manual</MenuItem>
                        <MenuItem value="" disabled>
                            <em>select an offset</em>
                        </MenuItem>
                        <MenuItem value="-6800000000">DK5AV X-Band (-6800MHz)</MenuItem>
                        <MenuItem value="125000000">Ham-it-Up (+125MHz)</MenuItem>
                        <MenuItem value="-10700000000">Ku LNB (-10700MHz)</MenuItem>
                        <MenuItem value="-9750000000">Ku LNB (-9750MHz)</MenuItem>
                        <MenuItem value="-1998000000">MMDS S-Band (-1998MHz)</MenuItem>
                        <MenuItem value="120000000">SpyVerter (+120MHz)</MenuItem>
                    </Select>
                </FormControl>

                <FormControl disabled={selectedOffsetMode !== "manual"} sx={{minWidth: 200, marginTop: 1}}
                             fullWidth variant="filled"
                             size="small">
                    <TextField
                        disabled={selectedOffsetMode !== "manual"}
                        label="Manual Offset (Hz)"
                        value={selectedOffsetValue}
                        variant="filled"
                        size="small"
                        type="number"
                        onChange={(e) => {
                            const offset = parseFloat(e.target.value);
                            if (!isNaN(offset)) {
                                onOffsetValueChange({target: {value: offset.toString()}});
                            }
                        }}
                    />
                </FormControl>

            </AccordionDetails>
        </Accordion>
    );
};

export default FrequencyControlAccordion;