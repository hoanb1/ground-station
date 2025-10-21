import React from 'react';
import { Paper, Box, Stack, IconButton } from '@mui/material';
import StopIcon from '@mui/icons-material/Stop';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AlignHorizontalLeftIcon from '@mui/icons-material/AlignHorizontalLeft';
import AlignHorizontalRightIcon from '@mui/icons-material/AlignHorizontalRight';
import AutoGraphIcon from '@mui/icons-material/AutoGraph';
import HeightIcon from '@mui/icons-material/Height';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ErrorIcon from '@mui/icons-material/Error';
import TimelineIcon from '@mui/icons-material/Timeline';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import { VFO1Icon, VFO2Icon, VFO3Icon, VFO4Icon } from '../common/icons.jsx';
import { useTranslation } from 'react-i18next';

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
                              toggleRotatorDottedLines
                          }) => {
    const { t } = useTranslation('waterfall');

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
                    color="secondary"
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
                    color={showLeftSideWaterFallAccessories ? 'warning' : 'secondary'}
                    onClick={toggleLeftSideWaterFallAccessories}
                    size="small"
                    title={t('toolbar.toggle_left_panel')}
                    sx={{
                        borderRadius: 0,
                        '&:hover': {
                        }
                    }}
                >
                    <AlignHorizontalLeftIcon/>
                </IconButton>

                <IconButton
                    color={showRightSideWaterFallAccessories ? 'warning' : 'secondary'}
                    onClick={toggleRightSideWaterFallAccessories}
                    size="small"
                    title={t('toolbar.toggle_right_panel')}
                    sx={{
                        borderRadius: 0,
                        '&:hover': {
                        }
                    }}
                >
                    <AlignHorizontalRightIcon/>
                </IconButton>
                <IconButton
                    onClick={toggleAutoDBRange}
                    size="small"
                    color={autoDBRange ? 'warning' : 'secondary'}
                    title={t('toolbar.toggle_auto_db')}
                    sx={{
                        borderRadius: 0,
                        backgroundColor: autoDBRange ? 'success.main' : 'transparent',
                        opacity: autoDBRange ? 0.1 : 1,
                        '&:hover': {
                            backgroundColor: autoDBRange ? 'success.main' : 'primary.main',
                            opacity: autoDBRange ? 0.2 : 0.1,
                        }
                    }}
                >
                    <AutoGraphIcon/>
                </IconButton>

                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={autoScale}
                    size="small"
                    color="secondary"
                    title={t('toolbar.auto_scale_once')}
                >
                    <HeightIcon/>
                </IconButton>

                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={toggleFullscreen}
                    color="secondary"
                    title={t('toolbar.toggle_fullscreen')}
                >
                    {isFullscreen ? <FullscreenExitIcon/> : <FullscreenIcon/>}
                </IconButton>
                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={handleZoomIn}
                    color="secondary"
                    title={t('toolbar.zoom_in')}
                >
                    <ZoomInIcon/>
                </IconButton>

                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={handleZoomOut}
                    color="secondary"
                    title={t('toolbar.zoom_out')}
                >
                    <ZoomOutIcon/>
                </IconButton>

                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={handleZoomReset}
                    color="secondary"
                    title={t('toolbar.reset_zoom')}
                >
                    <RestartAltIcon/>
                </IconButton>

                {/* New toggle button for rotator dotted lines */}
                <IconButton
                    onClick={() => {
                        console.info("before:", showRotatorDottedLines);
                        toggleRotatorDottedLines(!showRotatorDottedLines);
                    }}
                    size="small"
                    color={showRotatorDottedLines ? 'warning' : 'secondary'}
                    title={t('toolbar.toggle_rotator_lines')}
                    sx={{
                        borderRadius: 0,
                        backgroundColor: showRotatorDottedLines ? 'success.main' : 'transparent',
                        opacity: showRotatorDottedLines ? 0.1 : 1,
                        '&:hover': {
                            backgroundColor: showRotatorDottedLines ? 'success.main' : 'primary.main',
                            opacity: showRotatorDottedLines ? 0.2 : 0.1,
                        }
                    }}
                >
                    <HorizontalRuleIcon/>
                </IconButton>

                <IconButton
                    sx={{
                        borderRadius: 0,
                        width: 40,
                        fontSize: '1.25rem',
                        fontFamily: 'Monospace',
                        fontWeight: 'bold',
                        color: vfoColors[0],
                        backgroundColor: vfoActive[1] ? vfoColors[0] : 'transparent',
                        opacity: vfoActive[1] ? 0.1 : 1,
                        '&:hover': {
                            backgroundColor: vfoActive[1] ? vfoColors[0] : 'action.hover',
                            opacity: vfoActive[1] ? 0.2 : 1,
                        },
                        '& .MuiTouchRipple-root': {
                            border: vfoActive[1] ? '1px solid' : 'none',
                            borderColor: vfoColors[0],
                        },
                    }}
                    onClick={() => toggleVfo(1)}
                    color={vfoActive[1] ? 'warning' : 'secondary'}
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
                        backgroundColor: vfoActive[2] ? vfoColors[1] : 'transparent',
                        opacity: vfoActive[2] ? 0.1 : 1,
                        '&:hover': {
                            backgroundColor: vfoActive[2] ? vfoColors[1] : 'action.hover',
                            opacity: vfoActive[2] ? 0.2 : 1,
                        },
                        '& .MuiTouchRipple-root': {
                            border: vfoActive[2] ? '1px solid' : 'none',
                            borderColor: vfoColors[1],
                        },
                    }}
                    onClick={() => toggleVfo(2)}
                    color={vfoActive[2] ? 'warning' : 'secondary'}
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
                        backgroundColor: vfoActive[3] ? vfoColors[2] : 'transparent',
                        opacity: vfoActive[3] ? 0.1 : 1,
                        '&:hover': {
                            backgroundColor: vfoActive[3] ? vfoColors[2] : 'action.hover',
                            opacity: vfoActive[3] ? 0.78 : 1,
                        },
                        '& .MuiTouchRipple-root': {
                            border: vfoActive[3] ? '1px solid' : 'none',
                            borderColor: vfoColors[2],
                        },
                    }}
                    onClick={() => toggleVfo(3)}
                    color={vfoActive[3] ? 'warning' : 'secondary'}
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
                        backgroundColor: vfoActive[4] ? vfoColors[3] : 'transparent',
                        opacity: vfoActive[4] ? 0.1 : 1,
                        '&:hover': {
                            backgroundColor: vfoActive[4] ? vfoColors[3] : 'action.hover',
                            opacity: vfoActive[4] ? 0.2 : 1,
                        },
                        '& .MuiTouchRipple-root': {
                            border: vfoActive[4] ? '1px solid' : 'none',
                            borderColor: vfoColors[3],
                        },
                    }}
                    onClick={() => toggleVfo(4)}
                    color={vfoActive[4] ? 'warning' : 'secondary'}
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
    </Paper>
    );
};

export default WaterfallToolbar;