import React from 'react';
import {
    Accordion,
    AccordionSummary,
    AccordionDetails,
    LoadingOverlay,
} from './settings-elements.jsx';
import Typography from '@mui/material/Typography';
import {
    Box,
    FormControl,
    FormControlLabel,
    InputLabel,
    ListSubheader,
    MenuItem,
    Select,
    Switch,
} from "@mui/material";
import { useTranslation } from 'react-i18next';

const SdrAccordion = ({
                          expanded,
                          onAccordionChange,
                          gettingSDRParameters,
                          isStreaming,
                          sdrs,
                          selectedSDRId,
                          onSDRChange,
                          gainValues,
                          localGain,
                          onGainChange,
                          sampleRateValues,
                          localSampleRate,
                          onSampleRateChange,
                          antennasList,
                          selectedAntenna,
                          onAntennaChange,
                          hasBiasT,
                          biasT,
                          onBiasTChange,
                          hasTunerAgc,
                          tunerAgc,
                          onTunerAgcChange,
                          hasSoapyAgc,
                          soapyAgc,
                          onSoapyAgcChange,
                          hasRtlAgc,
                          rtlAgc,
                          onRtlAgcChange,
                          isRecording,
                      }) => {
    const { t } = useTranslation('waterfall');

    return (
        <Accordion expanded={expanded} onChange={onAccordionChange}>
            <AccordionSummary
                sx={{
                    boxShadow: '-1px 4px 7px #00000059',
                }}
                aria-controls="panel3d-content" id="panel3d-header">
                <Typography component="span">{t('sdr.title')}</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{
                backgroundColor: 'background.elevated',
            }}>
                <LoadingOverlay loading={gettingSDRParameters}>
                    <Box sx={{mb: 2}}>

                        <FormControl disabled={isStreaming} margin="normal"
                                     sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth
                                     variant="filled"
                                     size="small">
                            <InputLabel htmlFor="sdr-select">{t('sdr.sdr_label')}</InputLabel>
                            <Select
                                id="sdr-select"
                                value={sdrs.length > 0 ? selectedSDRId : "none"}
                                onChange={onSDRChange}
                                variant={'filled'}>
                                <MenuItem value="none">
                                    {t('sdr.no_sdr_selected')}
                                </MenuItem>
                                {/* Local SDRs */}
                                {sdrs.filter(sdr => sdr.type.toLowerCase().includes('local')).length > 0 && (
                                    <ListSubheader>{t('sdr.local_sdrs')}</ListSubheader>
                                )}
                                {sdrs
                                    .filter(sdr => sdr.type.toLowerCase().includes('local'))
                                    .map((sdr, index) => {
                                        return <MenuItem value={sdr.id} key={`local-${index}`}>
                                            {sdr.name} ({sdr.type})
                                        </MenuItem>;
                                    })
                                }

                                {/* Remote SDRs */}
                                {sdrs.filter(sdr => sdr.type.toLowerCase().includes('remote')).length > 0 && (
                                    <ListSubheader>{t('sdr.remote_sdrs')}</ListSubheader>
                                )}
                                {sdrs
                                    .filter(sdr => sdr.type.toLowerCase().includes('remote'))
                                    .map((sdr, index) => {
                                        return <MenuItem value={sdr.id} key={`remote-${index}`}>
                                            {sdr.name} ({sdr.type})
                                        </MenuItem>;
                                    })
                                }

                                {/* Other SDRs (neither local nor remote) */}
                                {sdrs.filter(sdr => !sdr.type.toLowerCase().includes('local') && !sdr.type.toLowerCase().includes('remote')).length > 0 && (
                                    <ListSubheader>{t('sdr.other_sdrs')}</ListSubheader>
                                )}
                                {sdrs
                                    .filter(sdr => !sdr.type.toLowerCase().includes('local') && !sdr.type.toLowerCase().includes('remote'))
                                    .map((sdr, index) => {
                                        return <MenuItem value={sdr.id} key={`other-${index}`}>
                                            {sdr.name} ({sdr.type})
                                        </MenuItem>;
                                    })
                                }
                            </Select>
                        </FormControl>

                        <FormControl disabled={gettingSDRParameters}
                                     sx={{minWidth: 200, marginTop: 0, marginBottom: 1}}
                                     fullWidth={true}
                                     variant="filled" size="small">
                            <InputLabel>{t('sdr.gain_db')}</InputLabel>
                            <Select
                                disabled={gettingSDRParameters}
                                size={'small'}
                                value={gainValues.length ? localGain : "none"}
                                onChange={(e) => onGainChange(e.target.value)}
                                variant={'filled'}>
                                <MenuItem value="none">
                                    {t('sdr.no_gain_selected')}
                                </MenuItem>
                                {gainValues.map(gain => (
                                    <MenuItem key={gain} value={gain}>
                                        {gain} dB
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl disabled={gettingSDRParameters || isRecording}
                                     sx={{minWidth: 200, marginTop: 0, marginBottom: 1}}
                                     fullWidth={true}
                                     variant="filled" size="small">
                            <InputLabel>{t('sdr.sample_rate')}</InputLabel>
                            <Select
                                disabled={gettingSDRParameters || isRecording}
                                size={'small'}
                                value={sampleRateValues.includes(localSampleRate) ? localSampleRate : "none"}
                                onChange={(e) => onSampleRateChange(e.target.value)}
                                variant={'filled'}>
                                <MenuItem value="none">
                                    {t('sdr.no_rate_selected')}
                                </MenuItem>
                                {sampleRateValues.map(rate => {
                                    // Format the sample rate for display
                                    let displayValue;
                                    if (rate >= 1000000) {
                                        displayValue = `${(rate / 1000000).toFixed(rate % 1000000 === 0 ? 0 : 3)} MHz`;
                                    } else {
                                        displayValue = `${(rate / 1000).toFixed(rate % 1000 === 0 ? 0 : 3)} kHz`;
                                    }
                                    return (
                                        <MenuItem key={rate} value={rate}>
                                            {displayValue}
                                        </MenuItem>
                                    );
                                })}
                            </Select>
                        </FormControl>
                        <FormControl disabled={gettingSDRParameters || isRecording}
                                     sx={{minWidth: 200, marginTop: 0, marginBottom: 1}}
                                     fullWidth={true}
                                     variant="filled" size="small">
                            <InputLabel>{t('sdr.antenna')}</InputLabel>
                            <Select
                                disabled={gettingSDRParameters || isRecording}
                                size={'small'}
                                value={antennasList.rx.includes(selectedAntenna) ? selectedAntenna : "none"}
                                onChange={(e) => onAntennaChange(e.target.value)}
                                variant={'filled'}>
                                <MenuItem value="none">
                                    {t('sdr.no_antenna_selected')}
                                </MenuItem>
                                {antennasList.rx && antennasList.rx.map(antenna => (
                                    <MenuItem key={antenna} value={antenna}>
                                        {antenna}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    <Box sx={{mb: 0, ml: 1.5}}>
                        {hasBiasT && (
                            <FormControlLabel
                                control={
                                    <Switch
                                        disabled={gettingSDRParameters}
                                        size={'small'}
                                        checked={biasT}
                                        onChange={(e) => onBiasTChange(e.target.checked)}
                                    />
                                }
                                label={t('sdr.enable_bias_t')}
                            />
                        )}
                        {hasTunerAgc && (
                            <FormControlLabel
                                control={
                                    <Switch
                                        disabled={gettingSDRParameters}
                                        size={'small'}
                                        checked={tunerAgc}
                                        onChange={(e) => onTunerAgcChange(e.target.checked)}
                                    />
                                }
                                label={t('sdr.enable_tuner_agc')}
                            />
                        )}
                        {hasSoapyAgc && (
                            <FormControlLabel
                                control={
                                    <Switch
                                        disabled={gettingSDRParameters}
                                        size={'small'}
                                        checked={soapyAgc}
                                        onChange={(e) => onSoapyAgcChange(e.target.checked)}
                                    />
                                }
                                label={t('sdr.enable_agc')}
                            />
                        )}
                        {hasRtlAgc && (
                            <FormControlLabel
                                control={
                                    <Switch
                                        disabled={gettingSDRParameters}
                                        size={'small'}
                                        checked={rtlAgc}
                                        onChange={(e) => onRtlAgcChange(e.target.checked)}
                                    />
                                }
                                label={t('sdr.enable_rtl_agc')}
                            />
                        )}
                    </Box>
                </LoadingOverlay>
            </AccordionDetails>
        </Accordion>
    );
};

export default SdrAccordion;