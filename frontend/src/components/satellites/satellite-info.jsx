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

const SatelliteInfoModal = ({ open, handleClose, selectedSatellite }) => {
    return (
        <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
            <DialogTitle>Satellite Information</DialogTitle>
            <DialogContent>
                {selectedSatellite ? (
                    <Box>
                        <Grid container spacing={2}>
                            <Grid sx={{ mb: 2, textAlign: 'center' }} style={{minHeight: '300px', width: '60%' }} >
                                <TableContainer>
                                    <Table>
                                        <TableBody>
                                            <TableRow>
                                                <TableCell><strong>Name</strong></TableCell>
                                                <TableCell>{selectedSatellite['name']}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell><strong>NORAD ID</strong></TableCell>
                                                <TableCell>{selectedSatellite['norad_id']}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell><strong>Status</strong></TableCell>
                                                <TableCell>{betterStatusValue(selectedSatellite['status'])}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell><strong>Countries</strong></TableCell>
                                                <TableCell>{renderCountryFlagsCSV(selectedSatellite['countries'])}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell><strong>Operator</strong></TableCell>
                                                <TableCell>{selectedSatellite['operator'] || '-'}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell><strong>Launched</strong></TableCell>
                                                <TableCell>{betterDateTimes(selectedSatellite['launched'])}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell><strong>Deployed</strong></TableCell>
                                                <TableCell>{betterDateTimes(selectedSatellite['deployed'])}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell><strong>Decayed</strong></TableCell>
                                                <TableCell>{betterDateTimes(selectedSatellite['decayed'])}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell><strong>Updated</strong></TableCell>
                                                <TableCell>{betterDateTimes(selectedSatellite['updated'])}</TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Grid>
                            <Grid sx={{ mb: 2, textAlign: 'center' }} style={{minHeight: '300px', width: '38%' }} >
                                <Box sx={{ mb: 2, textAlign: 'right' }}>
                                    <img
                                        src={`http://192.168.60.99:5000/public/satimages/${selectedSatellite['norad_id']}.png`}
                                        alt={`Satellite ${selectedSatellite['norad_id']}`}
                                        style={{ maxWidth: '100%', height: 'auto' }}
                                    />
                                </Box>
                            </Grid>
                        </Grid>
                        <Box mt={2}>
                            <h3>Transmitters</h3>
                            {selectedSatellite['transmitters'] && selectedSatellite['transmitters'].length ? (
                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow style={{fontWeight: 'bold', backgroundColor: '#121212' }}>
                                                <TableCell><strong>Description</strong></TableCell>
                                                <TableCell><strong>Type</strong></TableCell>
                                                <TableCell><strong>Status</strong></TableCell>
                                                <TableCell><strong>Alive</strong></TableCell>
                                                <TableCell><strong>Uplink low</strong></TableCell>
                                                <TableCell><strong>Uplink high</strong></TableCell>
                                                <TableCell><strong>Uplink drift</strong></TableCell>
                                                <TableCell><strong>Downlink low</strong></TableCell>
                                                <TableCell><strong>Downlink high</strong></TableCell>
                                                <TableCell><strong>Downlink drift</strong></TableCell>
                                                <TableCell><strong>Mode</strong></TableCell>
                                                <TableCell><strong>Uplink mode</strong></TableCell>
                                                <TableCell><strong>Invert</strong></TableCell>
                                                <TableCell><strong>Baud</strong></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {selectedSatellite['transmitters'].map((transmitter, index) => (
                                                <TableRow key={index}>
                                                    <TableCell>{transmitter['description']}</TableCell>
                                                    <TableCell>{transmitter['type']}</TableCell>
                                                    <TableCell>{transmitter['status']}</TableCell>
                                                    <TableCell>{transmitter['alive'] || "-"}</TableCell>
                                                    <TableCell>{humanizeFrequency(transmitter['uplink_low']) || "-"}</TableCell>
                                                    <TableCell>{humanizeFrequency(transmitter['uplink_high']) || "-"}</TableCell>
                                                    <TableCell>{humanizeFrequency(transmitter['uplink_drift']) || "-"}</TableCell>
                                                    <TableCell>{humanizeFrequency(transmitter['downlink_low']) || "-"}</TableCell>
                                                    <TableCell>{humanizeFrequency(transmitter['downlink_high']) || "-"}</TableCell>
                                                    <TableCell>{humanizeFrequency(transmitter['downlink_drift']) || "-"}</TableCell>
                                                    <TableCell>{transmitter['mode'] || "-"}</TableCell>
                                                    <TableCell>{transmitter['uplink_mode'] || "-"}</TableCell>
                                                    <TableCell>{transmitter['invert'] || "-"}</TableCell>
                                                    <TableCell>{transmitter['baud'] || "-"}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
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