import {Fragment, useEffect, useState} from "react";
import {FormControl, FormControlLabel, InputLabel, MenuItem, Paper, Select, Stack, Switch} from "@mui/material";
import {styled} from "@mui/material/styles";
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import Grid from '@mui/material/Grid2';
import {TLEGROUPS, getTLEsByGroupId} from "./tles.jsx";

const TitleBar = styled(Paper)(({theme}) => ({
    width: '100%',
    height: '30px',
    padding: '3px',
    ...theme.typography.body2,
    textAlign: 'center',
}));

const ThemedSettingsDiv = styled('div')(({theme}) => ({
    backgroundColor: theme.palette.background.paper,
    fontsize: '0.9rem !important',
}));

function sleep(duration) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, duration);
    });
}

function SearchSatellite({initialSelectedSatelliteId, initialSelectedGroupId, initialSelectedSatelliteGroup, handleSelectSatelliteId}) {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState(initialSelectedSatelliteGroup);
    const [loading, setLoading] = useState(false);
    const [selectedSatelliteId, setSelectedSatelliteId] = useState(initialSelectedSatelliteId);

    useEffect(() => {
        let group = getTLEsByGroupId(initialSelectedGroupId);
        setOptions(group);
        return () => {
            setOptions([]);
        };
    }, [initialSelectedSatelliteGroup, initialSelectedGroupId]);

    const handleOpen = () => {
        setOpen(true);
        (async () => {
            setLoading(true);
            let group = getTLEsByGroupId(initialSelectedGroupId);
            setLoading(false);
            setOptions(group);
        })();
    };

    const handleClose = () => {
        setOpen(false);
        setOptions([]);
    };

    return (
        <Autocomplete
            onChange={(e, satellite) => {
                console.info("satellite selected", satellite);
                setSelectedSatelliteId(satellite['noradid']);
                handleSelectSatelliteId(satellite['noradid']);
            }}
            fullWidth
            size={"small"}
            open={open}
            onOpen={handleOpen}
            onClose={handleClose}
            isOptionEqualToValue={(option, value) => option.name === value.name}
            getOptionLabel={(option) => option.name}
            options={options}
            loading={loading}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label="Satellite"
                    slotProps={{
                        input: {
                            ...params.InputProps,
                            endAdornment: (
                                <Fragment>
                                    {loading ? <CircularProgress color="inherit" size={20} /> : null}
                                    {params.InputProps.endAdornment}
                                </Fragment>
                            ),
                        },
                    }}
                />
            )}
        />
    );
}

const SatSelectorIsland = ({ handleSelectSatelliteId }) => {

    // State for all settings
    const [selectedSatGroupId, setSelectedSatGroupId] = useState("noaa");
    const [selectedSatelliteId, setSelectedSatelliteId] = useState(25544);
    const [selectedSatelliteGroup, setSelectedSatelliteGroup] = useState({});

    useEffect(() => {
        let group = getTLEsByGroupId(selectedSatGroupId);
        setSelectedSatelliteGroup(group);
        return () => {
            // Cleanup logic goes here (optional)
        };
    }, [selectedSatGroupId]);

    return (
        <ThemedSettingsDiv>
            <TitleBar className={"react-grid-draggable"}>Select group and satellite</TitleBar>
            <Grid container spacing={{ xs: 1, md: 1 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 6, sm: 6, md: 6 }} style={{padding: '1rem 1rem 0rem 1rem'}}>
                    <FormControl fullWidth size={"small"}>
                        <InputLabel id="satellite-group">Group</InputLabel>
                        <Select labelId="satellite-group" value={selectedSatGroupId} label="Group" variant={"outlined"}
                            onChange={(e) => {
                                setSelectedSatGroupId(e.target.value);
                            }}>
                            {TLEGROUPS.map((o, key) => (
                                <MenuItem key={TLEGROUPS[key]['id']} value={TLEGROUPS[key]['id']}>
                                    {TLEGROUPS[key]['name']}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>
                <Grid size={{ xs: 6, sm: 6, md: 6 }} style={{padding: '1rem 1rem 1rem 1rem'}}>
                    <SearchSatellite
                        initialSelectedSatelliteId={selectedSatelliteId}
                        initialSelectedGroupId={selectedSatGroupId}
                        initialSelectedSatelliteGroup={selectedSatelliteGroup}
                        handleSelectSatelliteId={handleSelectSatelliteId}/>
                </Grid>
            </Grid>
        </ThemedSettingsDiv>
    );
};

export default SatSelectorIsland;