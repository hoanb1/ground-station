import {useSelector} from "react-redux";
import {
    betterDateTimes,
    betterStatusValue,
    renderCountryFlagsCSV,
    ThemedStackIsland,
    TitleBar
} from "../common/common.jsx";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import React from "react";

const SatelliteInfoIsland = () => {
    const {satelliteData} = useSelector((state) => state.targetSatTrack);

    const fixedWidthFont = {'fontFamily': 'monospace'};

    return (
        <>
            <TitleBar className={"react-grid-draggable"}>{satelliteData['details']['name']}</TitleBar>
            <ThemedStackIsland>
                <Table size="small" style={{ width: '100%' }}>
                    <TableBody>
                        <TableRow>
                            <TableCell><strong>Latitude:</strong></TableCell>
                            <TableCell style={fixedWidthFont}>{satelliteData['position']['lat'] ? satelliteData['position']['lat'].toFixed(4) : "n/a"}°</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell><strong>Longitude:</strong></TableCell>
                            <TableCell style={fixedWidthFont}>{satelliteData['position']['lon'] ? satelliteData['position']['lon'].toFixed(4) : "n/a"}°</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell><strong>Azimuth:</strong></TableCell>
                            <TableCell style={fixedWidthFont}>{satelliteData['position']['az'] ? satelliteData['position']['az'].toFixed(4) : "n/a"}°</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell><strong>Elevation:</strong></TableCell>
                            <TableCell style={fixedWidthFont}>{satelliteData['position']['el'] ? satelliteData['position']['el'].toFixed(4) : "n/a"}°</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell><strong>Altitude:</strong></TableCell>
                            <TableCell style={fixedWidthFont}>{satelliteData['position']['alt'] ? (satelliteData['position']['alt'] / 1000).toFixed(2) : "n/a"} km</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell><strong>Velocity:</strong></TableCell>
                            <TableCell style={fixedWidthFont}>{satelliteData['position']['vel'] ? satelliteData['position']['vel'].toFixed(2) : "n/a"} km/s</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell><strong>Status:</strong></TableCell>
                            <TableCell style={fixedWidthFont}>{satelliteData['details']['status']? betterStatusValue(satelliteData['details']['status']): "n/a"}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell><strong>Launch Date:</strong></TableCell>
                            <TableCell style={fixedWidthFont}>{satelliteData['details']['launched']? betterDateTimes(satelliteData['details']['launched']) :"n/a"}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell><strong>Countries:</strong></TableCell>
                            <TableCell style={fixedWidthFont}>{satelliteData['details']['countries']? renderCountryFlagsCSV(satelliteData['details']['countries']): "n/a"}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell><strong>Geostationary:</strong></TableCell>
                            <TableCell style={fixedWidthFont}>{satelliteData['details']['is_geostationary']? "Yes": "No"}</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell><strong>Transmitters:</strong></TableCell>
                            <TableCell style={fixedWidthFont}>{satelliteData['transmitters'] ? satelliteData['transmitters'].length : "n/a"}</TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </ThemedStackIsland>
        </>
    );
}


export default SatelliteInfoIsland;