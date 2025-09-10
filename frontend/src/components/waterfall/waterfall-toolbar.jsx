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
                          }) => (
    <Paper elevation={1} sx={{
        p: 0,
        display: 'inline-block',
        width: '100%',
        borderBottom: '1px solid',
        borderColor: '#434343',
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
                    title="Start streaming"
                    sx={{ borderRadius: 0 }}
                >
                    <PlayArrowIcon/>
                </IconButton>

                <IconButton
                    disabled={!isStreaming}
                    color="error"
                    onClick={stopStreaming}
                    title="Stop streaming"
                    sx={{ borderRadius: 0 }}
                >
                    <StopIcon/>
                </IconButton>

                <IconButton
                    color={showLeftSideWaterFallAccessories ? 'warning' : 'default'}
                    onClick={toggleLeftSideWaterFallAccessories}
                    size="small"
                    title="Toggle left side panel"
                    sx={{
                        borderRadius: 0,
                        backgroundColor: showLeftSideWaterFallAccessories ? 'rgba(25, 118, 210, 0.1)' : 'transparent',
                        '&:hover': {
                            backgroundColor: showLeftSideWaterFallAccessories ? 'rgba(25, 118, 210, 0.2)' : 'rgba(0, 0, 0, 0.1)'
                        }
                    }}
                >
                    <AlignHorizontalLeftIcon/>
                </IconButton>

                <IconButton
                    color={showRightSideWaterFallAccessories ? 'warning' : 'default'}
                    onClick={toggleRightSideWaterFallAccessories}
                    size="small"
                    title="Toggle right side panel"
                    sx={{
                        borderRadius: 0,
                        backgroundColor: showRightSideWaterFallAccessories ? 'rgba(25, 118, 210, 0.1)' : 'transparent',
                        '&:hover': {
                            backgroundColor: showRightSideWaterFallAccessories ? 'rgba(25, 118, 210, 0.2)' : 'rgba(0, 0, 0, 0.1)'
                        }
                    }}
                >
                    <AlignHorizontalRightIcon/>
                </IconButton>
                <IconButton
                    onClick={toggleAutoDBRange}
                    size="small"
                    color={autoDBRange ? 'warning' : 'primary'}
                    title="Toggle automatic dB range"
                    sx={{
                        borderRadius: 0,
                        backgroundColor: autoDBRange ? 'rgba(46, 125, 50, 0.1)' : 'transparent',
                        '&:hover': {
                            backgroundColor: autoDBRange ? 'rgba(46, 125, 50, 0.2)' : 'rgba(25, 118, 210, 0.1)'
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
                    title="Auto scale dB range once"
                >
                    <HeightIcon/>
                </IconButton>

                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={toggleFullscreen}
                    color="primary"
                    title="Toggle fullscreen"
                >
                    {isFullscreen ? <FullscreenExitIcon/> : <FullscreenIcon/>}
                </IconButton>
                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={handleZoomIn}
                    color="primary"
                    title="Zoom in"
                >
                    <ZoomInIcon/>
                </IconButton>

                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={handleZoomOut}
                    color="primary"
                    title="Zoom out"
                >
                    <ZoomOutIcon/>
                </IconButton>

                <IconButton
                    sx={{ borderRadius: 0 }}
                    onClick={handleZoomReset}
                    color="primary"
                    title="Reset zoom"
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
                    title="Toggle rotator event dotted lines"
                    sx={{
                        borderRadius: 0,
                        backgroundColor: showRotatorDottedLines ? 'rgba(46, 125, 50, 0.1)' : 'transparent',
                        '&:hover': {
                            backgroundColor: showRotatorDottedLines ? 'rgba(46, 125, 50, 0.2)' : 'rgba(25, 118, 210, 0.1)'
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
                        backgroundColor: vfoActive[1] ? 'rgba(255, 0, 0, 0.1)' : 'transparent',
                        '&:hover': {
                            backgroundColor: vfoActive[1] ? 'rgba(255, 0, 0, 0.2)' : 'rgba(0,0,0,0.1)'
                        },
                        '& .MuiTouchRipple-root': {
                            border: vfoActive[1] ? '1px solid' : 'none',
                            borderColor: '#ff0000',
                        },
                    }}
                    onClick={() => toggleVfo(1)}
                    color={vfoActive[1] ? 'warning' : 'primary'}
                    title="Toggle VFO 1"
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
                        backgroundColor: vfoActive[2] ? 'rgba(0,255,0,0.1)' : 'transparent',
                        '&:hover': {
                            backgroundColor: vfoActive[2] ? 'rgba(0,255,0,0.2)' : 'rgba(0,0,0,0.1)'
                        },
                        '& .MuiTouchRipple-root': {
                            border: vfoActive[2] ? '1px solid' : 'none',
                            borderColor: 'rgba(0,255,0,0.7)',
                        },
                    }}
                    onClick={() => toggleVfo(2)}
                    color={vfoActive[2] ? 'warning' : 'primary'}
                    title="Toggle VFO 2"
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
                        backgroundColor: vfoActive[3] ? 'rgba(0,0,255,0.1)' : 'transparent',
                        '&:hover': {
                            backgroundColor: vfoActive[3] ? 'rgba(18,49,255,0.78)' : 'rgba(0,0,0,0.1)'
                        },
                        '& .MuiTouchRipple-root': {
                            border: vfoActive[3] ? '1px solid' : 'none',
                            borderColor: 'rgba(18,49,255,0.8)',
                        },
                    }}
                    onClick={() => toggleVfo(3)}
                    color={vfoActive[3] ? 'warning' : 'primary'}
                    title="Toggle VFO 3"
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
                        backgroundColor: vfoActive[4] ? 'rgba(255,0,255,0.1)' : 'transparent',
                        '&:hover': {
                            backgroundColor: vfoActive[4] ? 'rgba(255,0,255,0.2)' : 'rgba(0,0,0,0.1)'
                        },
                        '& .MuiTouchRipple-root': {
                            border: vfoActive[4] ? '1px solid' : 'none',
                            borderColor: 'rgba(163,0,218,0.77)',
                        },
                    }}
                    onClick={() => toggleVfo(4)}
                    color={vfoActive[4] ? 'warning' : 'primary'}
                    title="Toggle VFO 4"
                >
                    <VFO4Icon/>
                </IconButton>

                {fftDataOverflow && (
                    <IconButton
                        sx={{
                            borderRadius: 0,
                            ml: 1,
                            backgroundColor: 'rgba(211, 47, 47, 0.15)',
                            '&:hover': { backgroundColor: 'rgba(211, 47, 47, 0.25)' }
                        }}
                        color="error"
                        title="FFT update rate overflow — incoming updates are being throttled"
                        disabled
                    >
                        <ErrorIcon />
                    </IconButton>
                )}
            </Stack>
        </Box>
    </Paper>
);

export default WaterfallToolbar;