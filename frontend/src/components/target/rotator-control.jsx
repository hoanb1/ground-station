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
    setTrackingStateInBackend
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
            <circle cx={cx} cy={cy} r={5} fill="red" />
            <path
                d={`M ${cx} ${cy} L ${target.x} ${target.y}`}
                stroke="red"
                strokeWidth={3}
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

function GaugeAz({az, limits = [null, null]}) {
    const [maxAz, minAz] = limits;

    return (
        <GaugeContainer
            style={{
                margin: 'auto',
                touchAction: 'auto',
                pointerEvents: 'none',
            }}
            valueMin={0}
            valueMax={360}
            width={150}
            height={150}
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
                <Pointer angle={minAz} stroke={"#393939"} strokeWidth={1}/>
                <Pointer angle={maxAz} stroke={"#393939"} strokeWidth={1}/>
            </>}
            <GaugePointer/>
            <text x="75" y="18" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>0</text>
            <text x="134" y="75" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>90</text>
            <text x="75" y="135" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>180</text>
            <text x="15" y="75" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>270</text>
        </GaugeContainer>
    );
}

function GaugeEl({el, maxElevation = null}) {
    return (
        <GaugeContainer
            style={{
                margin: 'auto',
                touchAction: 'auto',
                pointerEvents: 'none',  // Makes the element completely non-interactive
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
                <Pointer angle={0} stroke={"#393939"} strokeWidth={1} forElevation={true}/>
                <Pointer angle={maxElevation} stroke={"#393939"} strokeWidth={1} forElevation={true}/>
            </>}
            <GaugePointer/>
            <text x="107" y="114" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>0</text>
            <text x="80" y="55" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>45</text>
            <text x="20" y="23" textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight={"bold"}>90</text>
        </GaugeContainer>
    );
}


const RotatorControl = React.memo(({initialNoradId, initialGroupId}) => {
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
    } = useSelector((state) => state.targetSatTrack);

    const { rigs } = useSelector((state) => state.rigs);
    const { rotators } = useSelector((state) => state.rotators);

    const handleTrackingStop = () => {
        const newTrackingState = {...trackingState, 'rotator_state': "stopped"};
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}));
    };

    function getRotatorStateFromTracking() {
        return trackingState?.rotator_state || "unknown";
    }
    
    function getCurrentStatusofRotator() {

        if (rotatorData['connected'] === true) {
            if (rotatorData['minelevation'] === true) {
                return "Target below elevation limit";
            } else if (rotatorData['slewing'] === true) {
                return "Slewing";
            } else  if (rotatorData['tracking'] === true) {
                return "Tracking";
            } else {
                return "Idle";
            }
        } else {
            return "Not connected";
        }
    }

    function getConnectionStatusofRotator() {
        if (rotatorData['connected'] === true) {
            return "Connected";
        } else  if (rotatorData['connected'] === false) {
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
                console.info('response', response);

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
                    <FormControl disabled={["tracking", "connected", "stopped"].includes(trackingState['rotator_state'])}
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
                            <GaugeAz az={rotatorData['az']} limits={[null, null]}/>
                        </Grid>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <GaugeEl el={rotatorData['el']} maxElevation={null}/>
                        </Grid>

                    </Grid>

                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            AZ: <Typography variant="h7" style={{fontFamily: "Monospace, monospace", fontWeight: "bold"}}>
                               {rotatorData['az']}°
                            </Typography>
                        </Grid>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            EL: <Typography variant="h7" style={{fontFamily: "Monospace, monospace", fontWeight: "bold"}}>
                                {rotatorData['el']}°
                            </Typography>
                        </Grid>
                    </Grid>

                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <Typography variant={"body1"} style={{fontFamily: "Monospace, monospace", fontWeight: "bold"}}>
                                {getCurrentStatusofRotator()}
                            </Typography>
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
                        <Grid size="grow" style={{paddingRight: '0.5rem', flex: 2}}>
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