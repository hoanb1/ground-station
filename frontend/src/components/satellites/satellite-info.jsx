import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import {Box} from "@mui/material";
import TableContainer from "@mui/material/TableContainer";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import {betterDateTimes, betterStatusValue, humanizeFrequency, renderCountryFlagsCSV} from "../common/common.jsx";
import TableHead from "@mui/material/TableHead";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import * as React from "react";
import Grid from "@mui/material/Grid2";
import {DataGrid} from "@mui/x-data-grid";

const SatelliteInfoModal = ({open, handleClose, selectedSatellite}) => {
    return (
        <Dialog open={open} onClose={handleClose} maxWidth={"xl"} fullWidth={true}>
            <DialogTitle>Satellite Information</DialogTitle>
            <DialogContent>
                {selectedSatellite ? (
                    <Box>
                        <Grid
                            container
                            spacing={3}
                            sx={{
                                width: '100%',
                                flexDirection: {xs: 'column', md: 'row'}
                            }}
                        >
                            <Grid
                                xs={12}
                                sx={{
                                    backgroundColor: '#1e1e1e',
                                    borderRadius: '8px',
                                    padding: 3,
                                    minHeight: '300px',
                                    color: '#ffffff',
                                    width: {xs: '100%', md: '60%'},
                                    mb: {xs: 3, md: 0},
                                    boxSizing: 'border-box'
                                }}
                            >
                                <Box sx={{display: 'flex', flexDirection: 'column', gap: 2}}>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Name:</strong> <span>{selectedSatellite['name']}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>NORAD ID:</strong> <span>{selectedSatellite['norad_id']}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Status:</strong>
                                        <span>{betterStatusValue(selectedSatellite['status'])}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Countries:</strong>
                                        <span>{renderCountryFlagsCSV(selectedSatellite['countries'])}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Operator:</strong> <span>{selectedSatellite['operator'] || '-'}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Launched:</strong>
                                        <span>{betterDateTimes(selectedSatellite['launched'])}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Deployed:</strong>
                                        <span>{betterDateTimes(selectedSatellite['deployed'])}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                            borderBottom: '1px solid #444444',
                                        }}
                                    >
                                        <strong>Decayed:</strong>
                                        <span>{betterDateTimes(selectedSatellite['decayed'])}</span>
                                    </Box>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 0',
                                        }}
                                    >
                                        <strong>Updated:</strong>
                                        <span>{betterDateTimes(selectedSatellite['updated'])}</span>
                                    </Box>
                                </Box>
                            </Grid>
                            <Grid
                                xs={12}
                                sx={{
                                    textAlign: 'center',
                                    minHeight: '300px',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    backgroundColor: '#1e1e1e',
                                    borderRadius: '8px',
                                    width: {xs: '100%', md: '36%'},
                                    boxSizing: 'border-box'
                                }}
                            >
                                <Box sx={{textAlign: 'right'}}>
                                    <img
                                        src={`/satimages/${selectedSatellite['norad_id']}.png`}
                                        alt={`Satellite ${selectedSatellite['norad_id']}`}
                                        style={{
                                            maxWidth: '100%',
                                            height: 'auto',
                                            border: '1px solid #444444',
                                            borderRadius: '4px',
                                        }}
                                    />
                                </Box>
                            </Grid>
                        </Grid>
                        <Box mt={2}>
                            <h3>Transmitters</h3>
                            {selectedSatellite['transmitters'] && selectedSatellite['transmitters'].length ? (
                                <DataGrid
                                    rows={selectedSatellite['transmitters'].map((transmitter, index) => ({
                                        id: index,
                                        description: transmitter['description'] || "-",
                                        type: transmitter['type'] || "-",
                                        status: transmitter['status'] || "-",
                                        alive: transmitter['alive'] || "-",
                                        uplinkLow: humanizeFrequency(transmitter['uplink_low']) || "-",
                                        uplinkHigh: humanizeFrequency(transmitter['uplink_high']) || "-",
                                        uplinkDrift: humanizeFrequency(transmitter['uplink_drift']) || "-",
                                        downlinkLow: humanizeFrequency(transmitter['downlink_low']) || "-",
                                        downlinkHigh: humanizeFrequency(transmitter['downlink_high']) || "-",
                                        downlinkDrift: humanizeFrequency(transmitter['downlink_drift']) || "-",
                                        mode: transmitter['mode'] || "-",
                                        uplinkMode: transmitter['uplink_mode'] || "-",
                                        invert: transmitter['invert'] || "-",
                                        baud: transmitter['baud'] || "-",
                                    }))}
                                    columns={[
                                        {field: "description", headerName: "Description", flex: 1},
                                        {field: "type", headerName: "Type", flex: 1},
                                        {field: "status", headerName: "Status", flex: 1},
                                        {field: "alive", headerName: "Alive", flex: 1},
                                        {field: "uplinkLow", headerName: "Uplink low", flex: 1},
                                        {field: "uplinkHigh", headerName: "Uplink high", flex: 1},
                                        {field: "uplinkDrift", headerName: "Uplink drift", flex: 1},
                                        {field: "downlinkLow", headerName: "Downlink low", flex: 1},
                                        {field: "downlinkHigh", headerName: "Downlink high", flex: 1},
                                        {field: "downlinkDrift", headerName: "Downlink drift", flex: 1},
                                        {field: "mode", headerName: "Mode", flex: 1},
                                        {field: "uplinkMode", headerName: "Uplink mode", flex: 1},
                                        {field: "invert", headerName: "Invert", flex: 1},
                                        {field: "baud", headerName: "Baud", flex: 1},
                                    ]}
                                    disableSelectionOnClick
                                    sx={{
                                        border: 'none',
                                        backgroundColor: '#1e1e1e',
                                        color: '#ffffff',
                                        '& .MuiDataGrid-columnHeaders': {
                                            backgroundColor: '#333333',
                                            color: '#ffffff',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            borderBottom: '1px solid #444444',
                                        },
                                        '& .MuiDataGrid-cell': {
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            borderBottom: '1px solid #444444',
                                        },
                                        '& .MuiDataGrid-row': {
                                            '&:nth-of-type(odd)': {
                                                backgroundColor: '#292929',
                                            },
                                            '&:hover': {
                                                backgroundColor: '#3a3a3a',
                                            },
                                        },
                                        '& .MuiDataGrid-footerContainer': {
                                            backgroundColor: '#333333',
                                            color: '#ffffff',
                                        },
                                        '& .MuiDataGrid-cell:focus': {
                                            outline: 'none',
                                        },
                                        '& .MuiDataGrid-selectedRowCount': {
                                            color: '#ffffff',
                                        },
                                    }}
                                />
                            ) : (
                                <div style={{textAlign: 'center'}}>
                                    <span>No Transmitters Available</span>
                                </div>
                            )}
                        </Box>
                    </Box>
                ) : (
                    <span>No Satellite Data Available</span>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} color="primary">Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default SatelliteInfoModal;