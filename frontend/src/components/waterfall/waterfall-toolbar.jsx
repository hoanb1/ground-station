import React from 'react';
import { Paper, Box, Stack, IconButton, Menu, MenuItem, ListItemIcon } from '@mui/material';
import StopIcon from '@mui/icons-material/Stop';
import CheckIcon from '@mui/icons-material/Check';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ErrorIcon from '@mui/icons-material/Error';
import {
    VFO1Icon,
    VFO2Icon,
    VFO3Icon,
    VFO4Icon,
    ToggleLeftPanelIcon,
    ToggleRightPanelIcon,
    AutoDBIcon,
    AutoScaleOnceIcon,
    SignalPresetsIcon,
    ResetZoomIcon,
    RotatorLinesIcon
} from '../common/custom-icons.jsx';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

const WaterfallToolbar = ({
                              startStreamingLoading,
                              playButtonDisabled,
                              startStreaming,
                              stopStreaming,
                              isStreaming,
                              showLeftSideWaterFallAccessories,
                              toggleLeftSideWaterFallAccessories,
                              showRightSideWaterFallAccessories,
                              toggleRightSideWaterFallAccessories,
                              autoDBRange,
                              toggleAutoDBRange,
                              autoScale,
                              toggleFullscreen,
                              isFullscreen,
                              handleZoomIn,
                              handleZoomOut,
                              handleZoomReset,
                              vfoColors,
                              vfoActive,
                              toggleVfo,
                              fftDataOverflow,
                              showRotatorDottedLines,
                              toggleRotatorDottedLines,
                              setAutoScalePreset
                          }) => {
    const { t } = useTranslation('waterfall');
    const [menuAnchorEl, setMenuAnchorEl] = React.useState(null);
    const menuOpen = Boolean(menuAnchorEl);
    const autoScalePreset = useSelector((state) => state.waterfall.autoScalePreset);

    const handleMenuClick = (event) => {
        setMenuAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setMenuAnchorEl(null);
    };

    const handleStrongSignals = () => {
        // Set auto-scale preset for strong signals
        setAutoScalePreset('strong');
        handleMenuClose();
    };

    const handleMediumSignals = () => {
        // Set auto-scale preset for medium signals
        setAutoScalePreset('medium');
        handleMenuClose();
    };

    const handleWeakSignals = () => {
        // Set auto-scale preset for weak signals
        setAutoScalePreset('weak');
        handleMenuClose();
    };

    return (
    <Paper elevation={1} sx={{
        p: 0,
        display: 'inline-block',
        width: '100%',
        borderBottom: '1px solid',
        borderColor: 'border.main',
        paddingBottom: '0px',
        borderRadius: 0,
    }}>
        <Box sx={{
            width: '100%',
            overflowX: 'auto',
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' }
        }}>
            <Stack
                direction="row"
                spacing={0}
                sx={{
                    minWidth: 'min-content',
                    flexWrap: 'nowrap'
                }}
            >
                <IconButton
                    loading={startStreamingLoading}
                    disabled={playButtonDisabled}
                    color="primary"
                    onClick={startStreaming}
                    title={t('toolbar.start_streaming')}
                    sx={{ borderRadius: 0 }}
                >
                    <PlayArrowIcon/>
                </IconButton>

                <IconButton
                    disabled={!isStreaming}
                    color="error"
                    onClick={stopStreaming}
                    title={t('toolbar.stop_streaming')}
                    sx={{ borderRadius: 0 }}
                >
                    <StopIcon/>
                </IconButton>

                <IconButton
                    color={showLeftSideWaterFallAccessories ? 'warning' : 'primary'}
                    onClick={toggleLeftSideWaterFallAccessories}
                    size="small"
                    title={t('toolbar.toggle_left_panel')}
                    sx={{
                        borderRadius: 0,
                        '&:hover': {
                        }
                    }}
                >
                    <ToggleLeftPanelIcon/>
                </IconButton>

                <IconButton
                    color={showRightSideWaterFallAccessories ? 'warning' : 'primary'}
                    onClick={toggleRightSideWaterFallAccessories}
                    size="small"
                    title={t('toolbar.toggle_right_panel')}
                    sx={{
                        borderRadius: 0,
                        '&:hover': {
                        }
                    }}
                >
                    <ToggleRightPanelIcon/>
                </IconButton>
                <IconButton
                    onClick={toggleAutoDBRange}
                    size="small"
                    color={autoDBRange ? 'warning' : 'primary'}
                    title={t('toolbar.toggle_auto_db')}
                    sx={{
                        borderRadius: 0,
                        '&:hover': {
                        }
                    }}
                >
                    <AutoDBIcon/>
                </IconButton>

                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={autoScale}
                    size="small"
                    color="primary"
                    title={t('toolbar.auto_scale_once')}
                >
                    <AutoScaleOnceIcon/>
                </IconButton>

                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={handleMenuClick}
                    size="small"
                    color="primary"
                    title={t('toolbar.signal_strength_presets')}
                >
                    <SignalPresetsIcon />
                </IconButton>

                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={toggleFullscreen}
                    color="primary"
                    title={t('toolbar.toggle_fullscreen')}
                >
                    {isFullscreen ? <FullscreenExitIcon/> : <FullscreenIcon/>}
                </IconButton>
                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={handleZoomIn}
                    color="primary"
                    title={t('toolbar.zoom_in')}
                >
                    <ZoomInIcon/>
                </IconButton>

                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={handleZoomOut}
                    color="primary"
                    title={t('toolbar.zoom_out')}
                >
                    <ZoomOutIcon/>
                </IconButton>

                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={handleZoomReset}
                    color="primary"
                    title={t('toolbar.reset_zoom')}
                >
                    <ResetZoomIcon/>
                </IconButton>

                {/* New toggle button for rotator dotted lines */}
                <IconButton
                    onClick={() => {
                        console.info("before:", showRotatorDottedLines);
                        toggleRotatorDottedLines(!showRotatorDottedLines);
                    }}
                    size="small"
                    color={showRotatorDottedLines ? 'warning' : 'primary'}
                    title={t('toolbar.toggle_rotator_lines')}
                    sx={{
                        borderRadius: 0,
                        '&:hover': {
                        }
                    }}
                >
                    <RotatorLinesIcon/>
                </IconButton>

                <IconButton
                    sx={{
                        borderRadius: 0,
                        width: 40,
                        fontSize: '1.25rem',
                        fontFamily: 'Monospace',
                        fontWeight: 'bold',
                        color: vfoColors[0],
                        backgroundColor: vfoActive[1] ? 'action.selected' : 'transparent',
                        '&:hover': {
                            backgroundColor: vfoActive[1] ? 'action.hover' : undefined,
                        },
                    }}
                    onClick={() => toggleVfo(1)}
                    color={vfoActive[1] ? 'warning' : 'primary'}
                    title={t('toolbar.toggle_vfo', { number: 1 })}
                >
                    <VFO1Icon/>
                </IconButton>

                <IconButton
                    sx={{
                        borderRadius: 0,
                        width: 40,
                        fontSize: '1.25rem',
                        fontFamily: 'Monospace',
                        fontWeight: 'bold',
                        color: vfoColors[1],
                        backgroundColor: vfoActive[2] ? 'action.selected' : 'transparent',
                        '&:hover': {
                            backgroundColor: vfoActive[2] ? 'action.hover' : undefined,
                        },
                    }}
                    onClick={() => toggleVfo(2)}
                    color={vfoActive[2] ? 'warning' : 'primary'}
                    title={t('toolbar.toggle_vfo', { number: 2 })}
                >
                    <VFO2Icon/>
                </IconButton>

                <IconButton
                    sx={{
                        borderRadius: 0,
                        width: 40,
                        fontSize: '1.25rem',
                        fontFamily: 'Monospace',
                        fontWeight: 'bold',
                        color: vfoColors[2],
                        backgroundColor: vfoActive[3] ? 'action.selected' : 'transparent',
                        '&:hover': {
                            backgroundColor: vfoActive[3] ? 'action.hover' : undefined,
                        },
                    }}
                    onClick={() => toggleVfo(3)}
                    color={vfoActive[3] ? 'warning' : 'primary'}
                    title={t('toolbar.toggle_vfo', { number: 3 })}
                >
                    <VFO3Icon/>
                </IconButton>

                <IconButton
                    sx={{
                        borderRadius: 0,
                        width: 40,
                        fontSize: '1.25rem',
                        fontFamily: 'Monospace',
                        fontWeight: 'bold',
                        color: vfoColors[3],
                        backgroundColor: vfoActive[4] ? 'action.selected' : 'transparent',
                        '&:hover': {
                            backgroundColor: vfoActive[4] ? 'action.hover' : undefined,
                        },
                    }}
                    onClick={() => toggleVfo(4)}
                    color={vfoActive[4] ? 'warning' : 'primary'}
                    title={t('toolbar.toggle_vfo', { number: 4 })}
                >
                    <VFO4Icon/>
                </IconButton>

                {fftDataOverflow && (
                    <IconButton
                        sx={{
                            borderRadius: 0,
                            ml: 1,
                            backgroundColor: 'error.main',
                            opacity: 0.15,
                            '&:hover': {
                                backgroundColor: 'error.main',
                                opacity: 0.25,
                            }
                        }}
                        color="error"
                        title={t('toolbar.fft_overflow')}
                        disabled
                    >
                        <ErrorIcon />
                    </IconButton>
                )}
            </Stack>
        </Box>

        <Menu
            anchorEl={menuAnchorEl}
            open={menuOpen}
            onClose={handleMenuClose}
            anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'left',
            }}
            transformOrigin={{
                vertical: 'top',
                horizontal: 'left',
            }}
        >
            <MenuItem onClick={handleStrongSignals}>
                <ListItemIcon>
                    {autoScalePreset === 'strong' ? <CheckIcon fontSize="small" /> : <Box sx={{ width: 20 }} />}
                </ListItemIcon>
                {t('toolbar.preset_strong_signals')}
            </MenuItem>
            <MenuItem onClick={handleMediumSignals}>
                <ListItemIcon>
                    {autoScalePreset === 'medium' ? <CheckIcon fontSize="small" /> : <Box sx={{ width: 20 }} />}
                </ListItemIcon>
                {t('toolbar.preset_medium_signals')}
            </MenuItem>
            <MenuItem onClick={handleWeakSignals}>
                <ListItemIcon>
                    {autoScalePreset === 'weak' ? <CheckIcon fontSize="small" /> : <Box sx={{ width: 20 }} />}
                </ListItemIcon>
                {t('toolbar.preset_weak_signals')}
            </MenuItem>
        </Menu>
    </Paper>
    );
};

export default WaterfallToolbar;