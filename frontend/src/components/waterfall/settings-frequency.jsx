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
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation('waterfall');

    return (
        <Accordion expanded={expanded} onChange={onAccordionChange}>
            <AccordionSummary
                sx={{
                    boxShadow: '-1px 4px 7px #00000059',
                }}
                aria-controls="freq-content" id="freq-header">
                <Typography component="span">{t('frequency.title')}</Typography>
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
                    <InputLabel htmlFor="transmitter-select">{t('frequency.go_to_transmitter')}</InputLabel>
                    <Select
                        id="transmitter-select"
                        value={getProperTransmitterId()}
                        onChange={onTransmitterChange}
                        variant={'filled'}>
                        <MenuItem value="none">
                            {t('frequency.no_frequency_selected')}
                        </MenuItem>
                        <MenuItem value="" disabled>
                            <em>{t('frequency.select_transmitter')}</em>
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
                    <InputLabel htmlFor="frequency-offset-select">{t('frequency.frequency_offset')}</InputLabel>
                    <Select
                        id="frequency-offset-select"
                        value={selectedOffsetMode || "none"}
                        onChange={onOffsetModeChange}
                        variant={'filled'}>
                        <MenuItem value="none">
                            {t('frequency.no_frequency_offset')}
                        </MenuItem>
                        <MenuItem value="manual">{t('frequency.manual')}</MenuItem>
                        <MenuItem value="" disabled>
                            <em>{t('frequency.select_offset')}</em>
                        </MenuItem>
                        <MenuItem value="-6800000000">{t('frequency.offsets.dk5av_x_band')}</MenuItem>
                        <MenuItem value="125000000">{t('frequency.offsets.ham_it_up')}</MenuItem>
                        <MenuItem value="-10700000000">{t('frequency.offsets.ku_lnb_10700')}</MenuItem>
                        <MenuItem value="-9750000000">{t('frequency.offsets.ku_lnb_9750')}</MenuItem>
                        <MenuItem value="-1998000000">{t('frequency.offsets.mmds_s_band')}</MenuItem>
                        <MenuItem value="120000000">{t('frequency.offsets.spyverter')}</MenuItem>
                    </Select>
                </FormControl>

                <FormControl disabled={selectedOffsetMode !== "manual"} sx={{minWidth: 200, marginTop: 1}}
                             fullWidth variant="filled"
                             size="small">
                    <TextField
                        disabled={selectedOffsetMode !== "manual"}
                        label={t('frequency.manual_offset_hz')}
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