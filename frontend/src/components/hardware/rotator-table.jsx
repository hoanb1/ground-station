import * as React from 'react';
import Box from '@mui/material/Box';
import {DataGrid, gridClasses} from "@mui/x-data-grid";
import Stack from "@mui/material/Stack";
import {Button} from "@mui/material";
import {useState} from "react";
import DialogTitle from "@mui/material/DialogTitle";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";


export default function AntennaRotatorTable() {
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [openAddDialog, setOpenAddDialog] = useState(false);
    const [selected, setSelected] = useState([]);
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([
        {
            id: 1,
            name: 'Default Rotator',
            host: '192.168.10.5',
            port: 4533,
            minaz: 0,
            maxaz: 360,
            minel: 0,
            maxel: 90,
            aztype: 1,
            azendstop: 0,
        },
        {
            id: 2,
            name: 'Another Rotator',
            host: '192.168.10.7',
            port: 4533,
            minaz: 10,
            maxaz: 350,
            minel: 0,
            maxel: 90,
            aztype: 2,
            azendstop: 5,
        },
    ]);

    const [selectionModel, setSelectionModel] = useState([]);
    const [pageSize, setPageSize] = useState(5);

    const columns = [
        { field: 'name', headerName: 'Name', flex: 1 },
        { field: 'host', headerName: 'Host', flex: 1 },
        { field: 'port', headerName: 'Port', type: 'number', flex: 1 },
        { field: 'minaz', headerName: 'Min Az', type: 'number', flex: 1 },
        { field: 'maxaz', headerName: 'Max Az', type: 'number', flex: 1 },
        { field: 'minel', headerName: 'Min El', type: 'number', flex: 1 },
        { field: 'maxel', headerName: 'Max El', type: 'number', flex: 1 },
        { field: 'aztype', headerName: 'Az Type', type: 'number', flex: 1 },
        { field: 'azendstop', headerName: 'Az Endstop', type: 'number', flex: 1 },
    ];

    return (
        <Box sx={{ width: '100%' }}>
            <DataGrid
                loading={loading}
                rows={rows}
                columns={columns}
                checkboxSelection
                disableSelectionOnClick
                onRowSelectionModelChange={(selected)=>{
                    setSelected(selected);
                }}
                selectionModel={selected}
                pageSize={pageSize}
                onPageSizeChange={(newPageSize) => setPageSize(newPageSize)}
                rowsPerPageOptions={[5, 10, 25]}
                getRowId={(row) => row.id}
                sx={{
                    border: 0,
                    marginTop: 2,
                    [`& .${gridClasses.cell}:focus, & .${gridClasses.cell}:focus-within`]: {
                        outline: 'none',
                    },
                    [`& .${gridClasses.columnHeader}:focus, & .${gridClasses.columnHeader}:focus-within`]:
                        {
                            outline: 'none',
                        },
                }}
            />

            <Stack direction="row" spacing={2} style={{marginTop: 15}}>
                <Button variant="contained" onClick={() => setOpenAddDialog(true)}>
                    Add
                </Button>
                <Button variant="contained" disabled={selected.length !== 1}>
                    Edit
                </Button>
                <Button
                    variant="contained"
                    disabled={selected.length < 1}
                    color="error"
                    onClick={() => setOpenDeleteConfirm(true)}
                >
                    Delete
                </Button>
                <Dialog
                    open={openDeleteConfirm}
                    onClose={() => setOpenDeleteConfirm(false)}
                >
                    <DialogTitle>Confirm Deletion</DialogTitle>
                    <DialogContent>
                        Are you sure you want to delete the selected item(s)?
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setOpenDeleteConfirm(false)} color="primary">
                            Cancel
                        </Button>
                        <Button
                            variant="contained"
                            onClick={() => {
                                // Perform delete logic here
                                setOpenDeleteConfirm(false);
                            }}
                            color="error"
                        >
                            Delete
                        </Button>
                    </DialogActions>
                </Dialog>
            </Stack>
        </Box>
    );
}
