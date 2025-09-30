/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
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
import {
    setRotator,
    setTrackingStateInBackend,
    setRotatorConnecting,
    setRotatorDisconnecting,
    sendNudgeCommand,
} from "./target-slice.jsx";
import {enqueueSnackbar} from "notistack";
import {getClassNamesBasedOnGridEditing, TitleBar} from "../common/common.jsx";
import Grid from "@mui/material/Grid2";
import {Button, FormControl, InputLabel, MenuItem, Select} from "@mui/material";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { GaugeAz, GaugeEl } from './rotator-gauges.jsx';
import {
    getCurrentStatusofRotator,
    createTrackingState,
    canControlRotator,
    canStartTracking,
    canStopTracking,
    canConnectRotator,
    isRotatorSelectionDisabled
} from './rotator-utils.js';




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
        rotatorConnecting,
        rotatorDisconnecting,
    } = useSelector((state) => state.targetSatTrack);

    const { rigs } = useSelector((state) => state.rigs);
    const { rotators } = useSelector((state) => state.rotators);

    const handleTrackingStop = () => {
        const newTrackingState = {...trackingState, 'rotator_state': "stopped"};
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}));
    };

    const handleTrackingStart = () => {
        const newTrackingState = createTrackingState({
            satelliteId,
            groupId,
            rotatorState: "tracking",
            rigState: trackingState['rig_state'],
            selectedRadioRig,
            selectedRotator,
            selectedTransmitter
        });

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
        const newTrackingState = createTrackingState({
            satelliteId,
            groupId,
            rotatorState: "parked",
            rigState: trackingState['rig_state'],
            selectedRadioRig,
            selectedRotator,
            selectedTransmitter
        });
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {

            });
    }

    function connectRotator() {
        const newTrackingState = createTrackingState({
            satelliteId,
            groupId,
            rotatorState: "connected",
            rigState: trackingState['rig_state'],
            selectedRadioRig,
            selectedRotator,
            selectedTransmitter
        });
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {
                console.info("Response on setTrackingStateInBackend (connect): ", response);

            })
        .catch((error) => {
            dispatch(setRotatorConnecting(false));
        });
    }

    function disconnectRotator() {
        const newTrackingState = createTrackingState({
            satelliteId,
            groupId,
            rotatorState: "disconnected",
            rigState: trackingState['rig_state'],
            selectedRadioRig,
            selectedRotator,
            selectedTransmitter
        });
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {
                console.info("Response on setTrackingStateInBackend (disconnect): ", response);
            })
        .catch((error) => {
            dispatch(setRotatorDisconnecting(false));
        });
    }

    function handleRotatorChange(event) {
        dispatch(setRotator(event.target.value));
    }

    function handleNudgeCommand(cmd) {
        dispatch(sendNudgeCommand({socket: socket, cmd: {'cmd': cmd}}));
    }

    return (
        <>
            {/*<TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Rotator control</TitleBar>*/}
            <Grid container spacing={{ xs: 0, md: 0 }} columns={{ xs: 12, sm: 12, md: 12 }}>


                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}>
                    <FormControl disabled={isRotatorSelectionDisabled(trackingState)}
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

                {/*<Grid container direction="row" sx={{*/}
                {/*    backgroundColor: theme => rotatorData['connected'] ? theme.palette.success.main : theme.palette.info.main,*/}
                {/*    padding: '0.1rem',*/}
                {/*    justifyContent: "space-between",*/}
                {/*    alignItems: "center",*/}
                {/*    width: '100%',*/}
                {/*}}>*/}
                {/*    <Typography variant="body1" sx={{*/}
                {/*        color: theme => theme.palette.success.contrastText,*/}
                {/*        width: '90%',*/}
                {/*        textAlign: 'center',*/}
                {/*        display: 'inline-flex',*/}
                {/*        alignItems: 'center',*/}
                {/*        justifyContent: 'center',*/}
                {/*    }}>*/}
                {/*        {rotatorData['connected']*/}
                {/*            ? <CheckCircleOutlineIcon sx={{mr: 1}}/>*/}
                {/*            : <ErrorOutlineIcon sx={{mr: 1}}/>}*/}
                {/*        {getConnectionStatusofRotator()}*/}
                {/*    </Typography>*/}
                {/*</Grid>*/}

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
                                targetCurrentAz={satelliteData?.['position']['az']}
                                isGeoStationary={activePass?.['is_geostationary']}
                                isGeoSynchronous={activePass?.['is_geosynchronous']}
                            />
                        </Grid>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <GaugeEl
                                el={rotatorData['el']}
                                maxElevation={activePass?.['peak_altitude']}
                                targetCurrentEl={satelliteData?.['position']['el']}
                            />
                        </Grid>

                    </Grid>

                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            AZ: <Typography
                            variant="h5"
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
                            variant="h5"
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
                        <Grid size="grow"
                              style={{paddingRight: '0.5rem', flex: 1, paddingBottom: '0.5rem', paddingTop: '0.2rem'}}
                              container spacing={1} justifyContent="center">
                            <Grid>
                                <Button
                                    size="small"
                                    disabled={!canControlRotator(rotatorData, trackingState)}
                                    fullWidth={true}
                                    variant="contained"
                                    color="primary"
                                    style={{height: '30px', fontSize: '0.9rem', padding: 0}}
                                    onClick={() => {
                                        handleNudgeCommand("nudge_counter_clockwise");
                                    }}>
                                    ⟲ CCW
                                </Button>
                            </Grid>
                            <Grid>
                                <Button
                                    size="small"
                                    disabled={!canControlRotator(rotatorData, trackingState)}
                                    fullWidth={true}
                                    variant="contained"
                                    color="primary"
                                    sx={{}}
                                    style={{height: '30px', fontSize: '0.9rem', padding: 0}}
                                    onClick={() => {
                                        handleNudgeCommand("nudge_clockwise");
                                    }}>
                                    CW ⟳
                                </Button>
                            </Grid>
                        </Grid>
                        <Grid size="grow"
                              style={{paddingRight: '0rem', flex: 1, paddingBottom: '0.5rem', paddingTop: '0.2rem'}}
                              container
                              spacing={1} justifyContent="center">
                            <Grid>
                                <Button
                                    size="small"
                                    disabled={!canControlRotator(rotatorData, trackingState)}
                                    fullWidth={true}
                                    variant="contained"
                                    color="primary"
                                    style={{height: '30px', fontSize: '0.9rem', padding: 0}}
                                    onClick={() => {
                                        handleNudgeCommand("nudge_up");
                                    }}>
                                    ↑ UP
                                </Button>
                            </Grid>
                            <Grid>
                                <Button
                                    size="small"
                                    disabled={!canControlRotator(rotatorData, trackingState)}
                                    fullWidth={true}
                                    variant="contained"
                                    color="primary"
                                    style={{height: '30px', fontSize: '0.9rem', padding: 0}}
                                    onClick={() => {
                                        handleNudgeCommand("nudge_down");
                                    }}>
                                    DOWN ↓
                                </Button>
                            </Grid>
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
                                    height: '30px',
                                    padding: '2px 0px',
                                    backgroundColor: theme => {
                                        const rotatorStatus = getCurrentStatusofRotator(rotatorData, lastRotatorEvent);
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
                                            const rotatorStatus = getCurrentStatusofRotator(rotatorData, lastRotatorEvent);
                                            return rotatorStatus.fgColor;
                                        }
                                    }}
                                >
                                    {getCurrentStatusofRotator(rotatorData, lastRotatorEvent).value}
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
                            <Button
                            loading={rotatorConnecting}
                            disabled={!canConnectRotator(rotatorData, selectedRotator)}
                            fullWidth={true} variant="contained" color="success" style={{height: '40px'}}
                                    onClick={() => {
                                        connectRotator()
                                    }}>
                                CONNECT
                            </Button>
                        </Grid>
                        <Grid size="grow" style={{paddingRight: '0.5rem', flex: 1.5}}>
                            <Button
                                loading={rotatorDisconnecting}
                                disabled={["disconnected"].includes(trackingState['rotator_state'])}
                                fullWidth={true}
                                variant="contained" color="error" style={{height: '40px'}}
                                onClick={() => {
                                     disconnectRotator()
                                }}>
                                DISCONNECT
                            </Button>
                        </Grid>
                        <Grid size="grow" style={{paddingRight: '0rem', flex: 1}}>
                            <Button disabled={["disconnected"].includes(trackingState['rotator_state'])}
                                    fullWidth={true} variant="contained" color="warning" style={{height: '40px'}}
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
                            <Button fullWidth={true}
                                    disabled={!canStartTracking(trackingState, satelliteId, selectedRotator)}
                                    variant="contained" color="success" style={{height: '60px'}}
                                    onClick={()=>{handleTrackingStart()}}
                            >
                                TRACK
                            </Button>
                        </Grid>
                        <Grid size="grow">
                            <Button fullWidth={true}
                                    disabled={!canStopTracking(trackingState, satelliteId, selectedRotator)}
                                    variant="contained" color="error" style={{height: '60px'}}
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