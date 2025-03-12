import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import {autocompleteClasses, Checkbox, ListSubheader, Paper, Popper, useMediaQuery} from "@mui/material";
import { useTheme, styled } from '@mui/material/styles';
import React, {useEffect, useState, forwardRef, createContext, useContext, useRef} from "react";
import {getAllSatellites} from "./tles.jsx";
import Typography from "@mui/material/Typography";
import { VariableSizeList } from 'react-window';
import PropTypes from "prop-types";
import Grid from "@mui/material/Grid2";
import {useLocalStorageState} from "@toolpad/core";
import {CODEC_JSON} from "./common.jsx";
import {GroundStationTinyLogo} from "./icons.jsx";
import {TitleBar} from "./common.jsx";

const LISTBOX_PADDING = 8; // px

function renderRow(props) {
    const { data, index, style } = props;
    const dataSet = data[index];

    const inlineStyle = {
        ...style,
        top: style.top + LISTBOX_PADDING,
    };

    if (dataSet.hasOwnProperty('group')) {
        return (
            <ListSubheader key={dataSet.key} component="div" style={inlineStyle}>
                {dataSet.group}
            </ListSubheader>
        );
    }

    const { key, ...optionProps } = dataSet[0];
    return (
        <Typography key={key} component="li" {...optionProps} noWrap style={inlineStyle}>
            {`#${dataSet[1]['noradid']} - ${dataSet[1]['name']}`}
        </Typography>
    );
}

const OuterElementContext = createContext({});

const OuterElementType = forwardRef((props, ref) => {
    const outerProps = useContext(OuterElementContext);
    return <div ref={ref} {...props} {...outerProps} />;
});

function useResetCache(data) {
    const ref = useRef(null);
    useEffect(() => {
        if (ref.current != null) {
            ref.current.resetAfterIndex(0, true);
        }
    }, [data]);
    return ref;
}

// Adapter for react-window
const ListboxComponent = forwardRef(function ListboxComponent(props, ref) {
    const { children, ...other } = props;
    const itemData = [];
    children.forEach((item) => {
        itemData.push(item);
        itemData.push(...(item.children || []));
    });

    const theme = useTheme();
    const smUp = useMediaQuery(theme.breakpoints.up('sm'), {
        noSsr: true,
    });
    const itemCount = itemData.length;
    const itemSize = smUp ? 36 : 48;

    const getChildSize = (child) => {
        if (child.hasOwnProperty('group')) {
            return 48;
        }
        return itemSize;
    };

    const getHeight = () => {
        if (itemCount > 8) {
            return 8 * itemSize;
        }
        return itemData.map(getChildSize).reduce((a, b) => a + b, 0);
    };

    const gridRef = useResetCache(itemCount);

    return (
        <div ref={ref}>
            <OuterElementContext.Provider value={other}>
                <VariableSizeList
                    itemData={itemData}
                    height={getHeight() + 2 * LISTBOX_PADDING}
                    width="100%"
                    ref={gridRef}
                    outerElementType={OuterElementType}
                    innerElementType="ul"
                    itemSize={(index) => getChildSize(itemData[index])}
                    overscanCount={5}
                    itemCount={itemCount}
                >
                    {renderRow}
                </VariableSizeList>
            </OuterElementContext.Provider>
        </div>
    );
});

ListboxComponent.propTypes = {
    children: PropTypes.node,
};

export function OverviewSatelliteSelector({satelliteList, handleGroupSatelliteSelection}) {
    const [selectedSatellites, setSelectedSatellites] = useLocalStorageState('overview-selected-satellites', [], {codec: CODEC_JSON});
    const [openPopup, setOpenPopup] = useState(false);

    const StyledPopper = styled(Popper)({
        [`& .${autocompleteClasses.listbox}`]: {
            boxSizing: 'border-box',
            '& ul': {
                padding: 0,
                margin: 0,
            },
        },
    });

    const ThemedSettingsDiv = styled('div')(({theme}) => ({
        backgroundColor: "#1e1e1e",
        fontsize: '0.9rem !important',
    }));

    useEffect(() => {
        // Your effect logic here

        return () => {
            // Cleanup logic here
        };
    }, [/* Dependencies here */]);

    const memoizedValue = React.useMemo(() => {
        return selectedSatellites;
    }, [selectedSatellites]);

    return (
        <ThemedSettingsDiv>
            <TitleBar className={"react-grid-draggable"}>Select group and satellite</TitleBar>
            <Grid container spacing={{ xs: 1, md: 1 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 12, sm: 12, md: 12  }} style={{padding: '1rem 1rem 0rem 1rem'}}>
                    <Autocomplete
                        onChange={(e, satellites) => {
                            setSelectedSatellites(satellites);
                            handleGroupSatelliteSelection(satellites);
                        }}
                        value={memoizedValue}
                        multiple={true}
                        fullWidth={true}
                        disableCloseOnSelect={true}
                        size={"small"}
                        disableListWrap={true}
                        noOptionsText={"Could not find any satellites"}
                        options={satelliteList}
                        getOptionLabel={(option) => option.name}
                        //groupBy={(option) => option['noradid']}
                        renderInput={(params) => <TextField {...params} label="Selected satellites" placeholder="Select satellites" variant="outlined" />}
                        renderOption={(props, option, state) => [props, option, state.index]}
                        renderGroup={(params) => {
                            return params;
                        }}
                        slots={{
                            popper: StyledPopper,
                        }}
                        slotProps={{
                            listbox: {
                                component: ListboxComponent,
                            },
                        }}
                    />
                </Grid>
            </Grid>
        </ThemedSettingsDiv>
    );
}

const MemoizedOverviewSatelliteSelector = React.memo(OverviewSatelliteSelector);
export default MemoizedOverviewSatelliteSelector;
