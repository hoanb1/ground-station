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
import { VFO1Icon, VFO2Icon, VFO3Icon, VFO4Icon } from '../common/custom-icons.jsx';
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
                    <AlignHorizontalLeftIcon/>
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
                    <AlignHorizontalRightIcon/>
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
                    <AutoGraphIcon/>
                </IconButton>

                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={autoScale}
                    size="small"
                    color="primary"
                    title={t('toolbar.auto_scale_once')}
                >
                    <HeightIcon/>
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
                    <RestartAltIcon/>
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
                        '&:hover': {
                        },
                        '& .MuiTouchRipple-root': {
                            border: vfoActive[1] ? '1px solid' : 'none',
                            borderColor: vfoColors[0],
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
                        '&:hover': {
                        },
                        '& .MuiTouchRipple-root': {
                            border: vfoActive[2] ? '1px solid' : 'none',
                            borderColor: vfoColors[1],
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
                        '&:hover': {
                        },
                        '& .MuiTouchRipple-root': {
                            border: vfoActive[3] ? '1px solid' : 'none',
                            borderColor: vfoColors[2],
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
                        '&:hover': {
                        },
                        '& .MuiTouchRipple-root': {
                            border: vfoActive[4] ? '1px solid' : 'none',
                            borderColor: vfoColors[3],
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
    </Paper>
    );
};

export default WaterfallToolbar;