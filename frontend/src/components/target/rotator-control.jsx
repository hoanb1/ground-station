/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
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


import * as React from "react";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import {useEffect, useRef} from "react";
import { styled } from '@mui/material/styles';
import {
    fetchSatelliteGroups,
    fetchSatellitesByGroupId,
    setGroupOfSats,
    setRadioRig,
    setRotator,
    setSatelliteGroupSelectOpen,
    setSatelliteId,
    setSatGroupId,
    setSelectedTransmitter,
    setStarting,
    setTrackingStateInBackend,
    setActivePass,
} from "./target-sat-slice.jsx";
import {enqueueSnackbar} from "notistack";
import {getClassNamesBasedOnGridEditing, humanizeFrequency, TitleBar} from "../common/common.jsx";
import Grid from "@mui/material/Grid2";
import {Button, Chip, FormControl, InputLabel, ListSubheader, MenuItem, Select} from "@mui/material";
import {
    GaugeContainer,
    GaugeValueArc,
    GaugeReferenceArc,
    useGaugeState,
    Gauge,
    gaugeClasses,
} from '@mui/x-charts/Gauge';
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';


function GaugePointer() {
    const { valueAngle, outerRadius, cx, cy } = useGaugeState();

    if (valueAngle === null) {
        // No value to display
        return null;
    }

    const target = {
        x: cx + outerRadius * Math.sin(valueAngle),
        y: cy - outerRadius * Math.cos(valueAngle),
    };
    return (
        <g>
            {/* Define the filter for drop shadow */}
            <defs>
                <filter id="gauge-pointer-shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="2" dy="2" stdDeviation="2" floodOpacity="0.5" floodColor="rgba(0,0,0,0.5)" />
                </filter>
            </defs>

            {/* Apply the filter to both circle and path */}
            <circle
                cx={cx}
                cy={cy}
                r={5}
                fill="red"
                filter="url(#gauge-pointer-shadow)"
            />
            <path
                d={`M ${cx} ${cy} L ${target.x} ${target.y}`}
                stroke="red"
                strokeWidth={3}
                filter="url(#gauge-pointer-shadow)"
            />
        </g>
    );
}


const Pointer = ({angle, stroke = "#393939", strokeWidth = 1, opacity = 1, forElevation = false}) => {
    const {outerRadius, cx, cy} = useGaugeState();
    const angleInRad = forElevation ?
        ((90 - angle) * Math.PI) / 180 :
        (angle * Math.PI) / 180;
    const target = {
        x: cx + outerRadius * Math.sin(angleInRad),
        y: cy - outerRadius * Math.cos(angleInRad),
    };
    return (
        <g>
            <path
                d={`M ${cx} ${cy} L ${target.x} ${target.y}`}
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={opacity}
            />
        </g>
    );
};

const CircleSlice = ({
                         startAngle,
                         endAngle,
                         stroke = "#393939",
                         fill = "#393939",
                         strokeWidth = 1,
                         opacity = 1,
                         forElevation = false,
                         peakAz = null
                     }) => {
    const { outerRadius, cx, cy } = useGaugeState();

    // Convert startAngle and endAngle to radians
    const startAngleRad = (startAngle * Math.PI) / 180;
    const endAngleRad = (endAngle * Math.PI) / 180;

    // Calculate the start and end points on the circle
    const start = {
        x: cx + outerRadius * Math.sin(startAngleRad),
        y: cy - outerRadius * Math.cos(startAngleRad),
    };

    const end = {
        x: cx + outerRadius * Math.sin(endAngleRad),
        y: cy - outerRadius * Math.cos(endAngleRad),
    };

    function determineClockwiseDirection(arcArray) {
        if (arcArray.length > 0 && arcArray.length > 1) {
            if (arcArray[0] < arcArray[1]) {
                return 1;
            } else {
                return 0;
            }
        } else {
            return 1; // Default to clockwise
        }
    }

    function determineArcToDisplay(startAz, endAz, peakAz) {
        // Normalize angles to 0-360 range
        startAz = Math.round((startAz + 360) % 360);
        endAz = Math.round((endAz + 360) % 360);

        if (peakAz !== null) {
            peakAz = Math.round((peakAz + 360) % 360);

            // Create lists for the small arc and big arc degrees
            let smallArcDegrees = [];
            let bigArcDegrees = [];

            // Calculate the angle difference
            const angleDiff = (endAz - startAz + 360) % 360;

            // Determine which arc is the small one
            if (angleDiff <= 180) {
                // Small arc is clockwise from start to end
                let current = startAz;
                while (current !== endAz) {
                    smallArcDegrees.push(current);
                    current = (current + 1) % 360;
                }

                // Big arc is counter-clockwise from start to end
                current = startAz;
                while (current !== endAz) {
                    current = (current - 1 + 360) % 360;
                    bigArcDegrees.push(current);
                }
            } else {
                // Small arc is counter-clockwise from start to end
                let current = startAz;
                while (current !== endAz) {
                    current = (current - 1 + 360) % 360;
                    smallArcDegrees.push(current);
                }

                // Big arc is clockwise from start to end
                current = startAz;
                while (current !== endAz) {
                    current = (current + 1) % 360;
                    bigArcDegrees.push(current);
                }
            }
            console.info(`smallArcDegrees: ${smallArcDegrees.length > 0 ? smallArcDegrees[0] + '...' + smallArcDegrees[smallArcDegrees.length-1] : 'empty'}`);
            console.info(`bigArcDegrees: ${bigArcDegrees.length > 0 ? bigArcDegrees[0] + '...' + bigArcDegrees[bigArcDegrees.length-1] : 'empty'}`);

            // Check which arc contains the peak azimuth
            if (smallArcDegrees.includes(peakAz)) {
                // Get x-wise direction for arc
                const clockwiseDirection = determineClockwiseDirection(smallArcDegrees);

                // Use 0 for a small arc
                return [0, clockwiseDirection];

            } else if (bigArcDegrees.includes(peakAz)) {
                // Get x-wise direction for arc
                const clockwiseDirection = determineClockwiseDirection(bigArcDegrees);

                // Use 1 for a big arc
                return [1, clockwiseDirection];
            } else {
                // Default values if peak is not in either list
                return [angleDiff > 180 ? 1 : 0, 1];
            }
        }

        // Without peak azimuth, use standard arc determination
        const angleDiff = (endAz - startAz + 360) % 360;
        return [angleDiff > 180 ? 1 : 0, 1];
    }

    let largeArcFlag = 0;
    let sweepFlag = 1;

    if (!forElevation) {
        // Get arc flags for SVG path
        const result = determineArcToDisplay(startAngle, endAngle, peakAz);
        if (result && result.length === 2) {
            [largeArcFlag, sweepFlag] = result;
        }
        console.info(`largeArcFlag: ${largeArcFlag}, sweepFlag: ${sweepFlag}`);
    } else {
        largeArcFlag = 0;
        sweepFlag = 0;
    }

    // Create the SVG path for a slice
    // M: Move to center
    // L: Line to start point
    // A: Arc from start to end point
    // Z: Close path (line back to center)
    const pathData = `
        M ${cx} ${cy}
        L ${start.x} ${start.y}
        A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}
        Z
    `;

    return (
        <g>
            <path
                d={pathData}
                stroke={stroke}
                strokeWidth={strokeWidth}
                fill={fill}
                opacity={opacity}
            />
        </g>
    );
};

const rescaleToRange = (value, originalMin, originalMax, targetMin, targetMax) => {
    // Calculate what percentage the value is in its original range
    const percentage = (value - originalMin) / (originalMax - originalMin);

    // Map that percentage to the target range
    return targetMin + percentage * (targetMax - targetMin);
};


function GaugeAz({az, limits = [null, null], peakAz = null}) {
    let [maxAz, minAz] = limits;

    return (
        <GaugeContainer
            style={{
                margin: 'auto',
                touchAction: 'auto',
                pointerEvents: 'none',
            }}
            valueMin={0}
            valueMax={360}
            width={140}
            height={140}
            startAngle={0}
            endAngle={360}
            value={az}
            onTouchStart={(e) => {
                // Stop event from bubbling up
                e.stopPropagation();
            }}
            onTouchMove={(e) => {
                // Stop event from bubbling up
                e.stopPropagation();
            }}
        >
            <GaugeReferenceArc/>
            {minAz !== null && maxAz !== null && <>
                <Pointer angle={maxAz} stroke={"#676767"} strokeWidth={1}/>
                <Pointer angle={minAz} stroke={"#676767"} strokeWidth={1}/>
                <CircleSlice
                    startAngle={minAz}
                    endAngle={maxAz}
                    peakAz={peakAz}
                    stroke={'#abff45'}
                    fill={'#abff45'}
                    opacity={0.2}
                />
            </>}
            <Pointer angle={270}/>
            <Pointer angle={180}/>
            <Pointer angle={90}/>
            <Pointer angle={0}/>
            <text x="70" y="18" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>0</text>
            <text x="124" y="70" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>90</text>
            <text x="70" y="125" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>180</text>
            <text x="15" y="70" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>270</text>
            <GaugePointer/>
        </GaugeContainer>
    );
}

function GaugeEl({el, maxElevation = null}) {
    const angle = rescaleToRange(maxElevation, 0, 90, 90, 0);
    return (
        <GaugeContainer
            style={{
                margin: 'auto',
                touchAction: 'auto',
                pointerEvents: 'none',
            }}
            valueMin={90}
            valueMax={0}
            width={130}
            height={130}
            startAngle={0}
            endAngle={90}
            value={el}
            onTouchStart={(e) => {
                // Stop event from bubbling up
                e.stopPropagation();
            }}
            onTouchMove={(e) => {
                // Stop event from bubbling up
                e.stopPropagation();
            }}
        >
            <GaugeReferenceArc/>
            {maxElevation !== null && <>
                <Pointer angle={angle} stroke={"#676767"} strokeWidth={1} opacity={1}/>
                <CircleSlice
                    startAngle={90}
                    endAngle={angle}
                    stroke={'#abff45'}
                    fill={'#abff45'}
                    opacity={0.2}
                    forElevation={true}
                    spansNorth={false}
                />
            </>}
            <CircleSlice
                startAngle={90}
                endAngle={80}
                stroke={'#ff4545'}
                fill={'#ff4545'}
                forElevation={true}
                opacity={0.2}
            />
            <Pointer angle={80} stroke={"#ff0101"} strokeWidth={0.8} opacity={0.7}/>
            <Pointer angle={0}/>
            <text x="107" y="120" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>0</text>
            <text x="80" y="55" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>45</text>
            <text x="10" y="23" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>90</text>
            <GaugePointer/>
        </GaugeContainer>
    );
}


const RotatorControl = React.memo(({}) => {
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const {
        satGroups,
        groupId,
        loading,
        error,
        satelliteSelectOpen,
        satelliteGroupSelectOpen,
        groupOfSats,
        trackingState,
        satelliteId,
        uiTrackerDisabled,
        starting,
        selectedRadioRig,
        selectedRotator,
        selectedTransmitter,
        availableTransmitters,
        rotatorData,
        gridEditable,
        satelliteData,
        lastRotatorEvent,
        satellitePasses,
        activePass,
    } = useSelector((state) => state.targetSatTrack);

    const { rigs } = useSelector((state) => state.rigs);
    const { rotators } = useSelector((state) => state.rotators);

    const handleTrackingStop = () => {
        const newTrackingState = {...trackingState, 'rotator_state': "stopped"};
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}));
    };

    useEffect(() => {
        // Look through the passes and determine which one is active right now
        if (satellitePasses) {
            const now = new Date().getTime();
            const activePass = satellitePasses.find(pass => {
               const startTime = new Date(pass['event_start']).getTime();
               const endTime = new Date(pass['event_end']).getTime();
               return now >= startTime && now <= endTime;
            });
            dispatch(setActivePass(activePass));
        }
    },[rotatorData]);


    function getCurrentStatusofRotator() {
        // Define a status mapping with colors
        const statusMap = {
            'minelevation': {
                text: "Target below elevation limit",
                bgColor: 'error.light',
                fgColor: 'error.dark'
            },
            'slewing': {
                text: "Slewing",
                bgColor: 'warning.light',
                fgColor: 'warning.dark'
            },
            'tracking': {
                text: "Tracking",
                bgColor: 'success.light',
                fgColor: 'success.dark'
            },
            'stopped': {
                text: "Stopped",
                bgColor: 'info.light',
                fgColor: 'info.dark'
            },
            'outofbounds': {
                text: "Out of bounds",
                bgColor: 'warning.light',
                fgColor: 'warning.dark'
            }
        };

        if (rotatorData['connected'] === true) {
            if (lastRotatorEvent) {
                // If the event exists in our map, use it, otherwise return "Idle"
                const status = statusMap[lastRotatorEvent] || {
                    text: "Idle",
                    bgColor: 'grey.200',
                    fgColor: 'grey.800'
                };
                return {
                    key: lastRotatorEvent,
                    value: status.text,
                    bgColor: status.bgColor,
                    fgColor: status.fgColor
                };
            } else {
                return {
                    key: 'unknown',
                    value: "Unknown",
                    bgColor: 'grey.200',
                    fgColor: 'grey.800'
                };
            }
        } else {
            return {
                key: 'disconnected',
                value: "-",
                bgColor: 'grey.600',
                fgColor: 'grey.800'
            };
        }
    }

    function getConnectionStatusofRotator() {
        if (rotatorData['connected'] === true) {
            return "Connected";
        } else if (rotatorData['connected'] === false) {
            return "Not connected";
        } else {
            return "unknown";
        }
    }

    const handleTrackingStart = () => {
        const newTrackingState = {
            'norad_id': satelliteId,
            'group_id': groupId,
            'rotator_state': "tracking",
            'rig_state': trackingState['rig_state'],
            'rig_id': selectedRadioRig,
            'rotator_id': selectedRotator,
            'transmitter_id': selectedTransmitter,
        };

        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {

            })
            .catch((error) => {
                enqueueSnackbar(`Failed to start tracking with the rotator: ${error.message}`, {
                    variant: "error"
                });
            });
    };

    function parkRotator() {
        const newTrackingState = {
            'norad_id': satelliteId,
            'group_id': groupId,
            'rotator_state': "parked",
            'rig_state': trackingState['rig_state'],
            'rig_id': selectedRadioRig,
            'rotator_id': selectedRotator,
            'transmitter_id': selectedTransmitter,
        };
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {

            });
    }

    function connectRotator() {
        const newTrackingState = {
            'norad_id': satelliteId,
            'group_id': groupId,
            'rotator_state': "connected",
            'rig_state': trackingState['rig_state'],
            'rig_id': selectedRadioRig,
            'rotator_id': selectedRotator,
            'transmitter_id': selectedTransmitter,
        };
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {

            });
    }

    function disconnectRotator() {
        const newTrackingState = {
            'norad_id': satelliteId,
            'group_id': groupId,
            'rotator_state': "disconnected",
            'rig_state': trackingState['rig_state'],
            'rig_id': selectedRadioRig,
            'rotator_id': selectedRotator,
            'transmitter_id': selectedTransmitter,
        };
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {

            });
    }

    function handleRotatorChange(event) {
        dispatch(setRotator(event.target.value));
    }

    console.info("activePass", activePass);

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Rotator control</TitleBar>
            <Grid container spacing={{ xs: 0, md: 0 }} columns={{ xs: 12, sm: 12, md: 12 }}>

                <Grid container direction="row" sx={{
                    backgroundColor: theme => rotatorData['connected'] ? theme.palette.success.main : theme.palette.info.main,
                    padding: '0.1rem',
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: '100%',
                }}>
                    <Typography variant="body1" sx={{
                        color: theme => theme.palette.success.contrastText,
                        width: '90%',
                        textAlign: 'center',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        {rotatorData['connected']
                            ? <CheckCircleOutlineIcon sx={{mr: 1}}/>
                            : <ErrorOutlineIcon sx={{mr: 1}}/>}
                        {getConnectionStatusofRotator()}
                    </Typography>
                </Grid>

                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}>
                    <FormControl disabled={["tracking", "connected", "stopped", "parked"].includes(trackingState['rotator_state'])}
                                 sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth variant="filled"
                                 size="small">
                        <InputLabel htmlFor="rotator-select">Rotator</InputLabel>
                        <Select
                            id="rotator-select"
                            value={rotators.length > 0? selectedRotator: "none"}
                            onChange={(event) => {
                                handleRotatorChange(event);
                            }}
                            variant={'filled'}>
                            <MenuItem value="none">
                                [no rotator control]
                            </MenuItem>
                            <MenuItem value="" disabled>
                                <em>select a rotator</em>
                            </MenuItem>
                            {rotators.map((rotators, index) => {
                                return <MenuItem value={rotators.id} key={index}>{rotators.name} ({rotators.host}:{rotators.port})</MenuItem>;
                            })}
                        </Select>
                    </FormControl>
                </Grid>

                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 0.5rem 0rem 0.5rem'}}>

                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}>

                    </Grid>

                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <GaugeAz
                                az={rotatorData['az']}
                                limits={[activePass?.['start_azimuth'], activePass?.['end_azimuth']]}
                                peakAz={activePass?.['peak_azimuth']}
                            />
                        </Grid>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <GaugeEl el={rotatorData['el']} maxElevation={activePass?.['peak_altitude']}/>
                        </Grid>

                    </Grid>

                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            AZ: <Typography
                            variant="h7"
                            sx={{
                                fontFamily: "Monospace, monospace",
                                fontWeight: "bold",
                                display: "inline-flex",
                                alignItems: "center",
                                minWidth: "80px",
                                justifyContent: "center"
                            }}
                        >
                            {rotatorData['az'].toFixed(1)}°
                        </Typography>
                        </Grid>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                             EL: <Typography
                            variant="h7"
                            sx={{
                                fontFamily: "Monospace, monospace",
                                fontWeight: "bold",
                                display: "inline-flex",
                                alignItems: "center",
                                minWidth: "80px",
                                justifyContent: "center"
                            }}
                        >
                            {rotatorData['el'].toFixed(1)}°
                        </Typography>
                        </Grid>
                    </Grid>

                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <Paper
                                elevation={1}
                                sx={{
                                    padding: '2px 0px',
                                    backgroundColor: theme => {
                                        const rotatorStatus = getCurrentStatusofRotator();
                                        return rotatorStatus.bgColor
                                    },
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '4px',
                                    minWidth: '180px',
                                    width: '100%',
                                }}
                            >
                                <Typography
                                    variant="body2"
                                    sx={{
                                        fontFamily: "Monospace, monospace",
                                        fontWeight: "bold",
                                        color: theme => {
                                            const rotatorStatus = getCurrentStatusofRotator();
                                            return rotatorStatus.fgColor;
                                        }
                                    }}
                                >
                                    {getCurrentStatusofRotator().value}
                                </Typography>
                            </Paper>
                        </Grid>

                    </Grid>
                </Grid>

                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}>
                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{paddingRight: '0.5rem', flex: 1}}>
                            <Button disabled={
                                ["tracking", "connected", "stopped", "parked"].includes(trackingState['rotator_state']) ||
                                ["none", ""].includes(selectedRotator)
                            } fullWidth={true} variant="contained" color="success" style={{height: '35px'}}
                                    onClick={() => {
                                        connectRotator()
                                    }}>
                                CONNECT
                            </Button>
                        </Grid>
                        <Grid size="grow" style={{paddingRight: '0.5rem', flex: 1.5}}>
                            <Button disabled={["disconnected"].includes(trackingState['rotator_state'])}
                                    fullWidth={true}
                                    variant="contained" color="error" style={{height: '35px'}}
                                    onClick={() => {
                                        disconnectRotator()
                                    }}>
                                DISCONNECT
                            </Button>
                        </Grid>
                        <Grid size="grow" style={{paddingRight: '0rem', flex: 1}}>
                            <Button disabled={["disconnected"].includes(trackingState['rotator_state'])}
                                    fullWidth={true} variant="contained" color="warning" style={{height: '35px'}}
                                    onClick={() => {
                                        parkRotator()
                                    }}>
                                PARK
                            </Button>
                        </Grid>
                    </Grid>
                </Grid>

                <Grid size={{xs: 12, sm: 12, md: 12}} style={{padding: '0.5rem 0.5rem 0.5rem'}}>
                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{paddingRight: '0.5rem'}}>
                            <Button fullWidth={true} disabled={
                                ["tracking", "disconnected"].includes(trackingState['rotator_state']) ||
                                satelliteId === "" ||
                                ["none", ""].includes(selectedRotator)
                            }
                                    variant="contained" color="success" style={{height: '60px'}}
                                    onClick={()=>{handleTrackingStart()}}
                            >
                                TRACK ROTATOR
                            </Button>
                        </Grid>
                        <Grid size="grow">
                            <Button fullWidth={true} disabled={
                                ["stopped", "parked", "disconnected", "connected"].includes(trackingState['rotator_state']) ||
                                satelliteId === "" ||
                                ["none", ""].includes(selectedRotator)
                            } variant="contained" color="error" style={{height: '60px'}}
                                    onClick={() => {handleTrackingStop()}}>
                                STOP
                            </Button>
                        </Grid>
                    </Grid>
                </Grid>
            </Grid>
        </>
    );
});

export default RotatorControl;