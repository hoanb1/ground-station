import * as React from "react";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import {useEffect} from "react";
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
import {humanizeFrequency, TitleBar} from "../common/common.jsx";
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

function GaugeAz({az}) {
    return (
        <GaugeContainer
            style={{margin: 'auto'}}
            valueMin={0}
            valueMax={360}
            width={150}
            height={100}
            startAngle={0}
            endAngle={360}
            value={az}
        >
            <GaugeReferenceArc />
            <GaugePointer />
        </GaugeContainer>
    );
}

function GaugeEl({el}) {
    return (
        <GaugeContainer
            style={{margin: 'auto'}}
            valueMin={90}
            valueMax={0}
            width={150}
            height={100}
            startAngle={0}
            endAngle={90}
            value={el}
        >
            <GaugeReferenceArc />
            <GaugePointer />
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
    } = useSelector((state) => state.targetSatTrack);

    const { rigs } = useSelector((state) => state.rigs);
    const { rotators } = useSelector((state) => state.rotators);

    const handleTrackingStop = () => {
        const newTrackingState = {...trackingState, 'rotator_state': "idle"};
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
        console.info(`trackingState`, trackingState);
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
                console.info('response', response);
            })
    }

    function handleRotatorChange(event) {
        dispatch(setRotator(event.target.value));
    }

    return (
        <>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Rotator control</TitleBar>
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
                    <FormControl disabled={trackingState['rotator_state'] === "tracking"}
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
                            <GaugeAz az={rotatorData['az']}/>
                        </Grid>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <GaugeEl el={rotatorData['el']}/>
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
                        <Grid size="grow" style={{paddingRight: '0.5rem'}}>
                            <Button fullWidth={true} variant="contained" color="secondary" style={{height: '35px'}}
                                    onClick={()=>{parkRotator()}}>
                                PARK
                            </Button>
                        </Grid>
                        <Grid size="grow" style={{paddingRight: '0.5rem'}}>
                            <Button disabled={true} fullWidth={true} variant="contained" color="info" style={{height: '35px'}}>
                                B
                            </Button>
                        </Grid>
                        <Grid size="grow" style={{paddingRight: '0rem'}}>
                            <Button disabled={true} fullWidth={true} variant="contained" color="info" style={{height: '35px'}}>
                                C
                            </Button>
                        </Grid>
                    </Grid>
                </Grid>

                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0.5rem 0.5rem 0.5rem'}}>
                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{paddingRight: '0.5rem'}}>
                            <Button fullWidth={true} disabled={
                                trackingState['rotator_state'] === "tracking" ||
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
                                trackingState['rotator_state'] === "idle" ||
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