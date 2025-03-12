import {styled} from "@mui/material/styles";
import Paper from "@mui/material/Paper";
import {Tooltip} from "react-leaflet";

export const StyledIslandParent = styled("div")(({ theme }) => ({
    padding: '0rem',
    border: '1px solid #424242',
    backgroundColor: "#1e1e1e",
    overflow: 'hidden',
}));

export const StyledIslandParentScrollbar = styled("div")(({ theme }) => ({
    padding: '0rem',
    border: '1px solid #424242',
    backgroundColor: "#1e1e1e",
    overflow: 'hidden',
    overflowY: 'hidden',
    overflowX: 'hidden',

}));

export const CODEC_JSON = {
    parse: (value) => {
        try {
            return JSON.parse(value);
        } catch {
            return { _error: 'parse failed' };
        }
    },
    stringify: (value) => JSON.stringify(value),
};

export const CODEC_BOOL = {
    parse: (value) => {
        return value === "1";
    },
    stringify: (value) => {
        try {
            return value === true? "1" : "0";
        } catch {
            return "0";
        }
    },
};

export const MapTitleBar = styled(Paper)(({ theme }) => ({
    width: '100%',
    height: '30px',
    padding: '4px 15px',
    ...theme.typography.body2,
    position: 'absolute',
    borderRadius: '0px 0px 0px 0px',
    borderBottom: '1px solid #494949',
    zIndex: 1000,
    top: 0,
    textAlign: 'left',

}));

export const MapStatusBar = styled(Paper)(({ theme }) => ({
    width: '100%',
    height: '30px',
    padding: '4px 15px',
    ...theme.typography.body2,
    position: 'absolute',
    borderRadius: '0px 0px 0px 0px',
    borderTop: '1px solid #494949',
    zIndex: 1000,
    bottom: 0,
    textAlign: 'left',
    fontWeight: 'normal',
}));

export const TitleBar = styled(Paper)(({ theme }) => ({
    width: '100%',
    height: '30px',
    padding: '4px 15px',
    ...theme.typography.body2,
    position: 'relative',
    borderRadius: '0px 0px 0px 0px',
    borderBottom: '1px solid #494949',
    textAlign: 'left',
    fontWeight: 'bold',
}));

export const ThemedLeafletTooltip = styled(Tooltip)(({ theme }) => ({
    color: theme.palette.text.primary,
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    borderColor: theme.palette.background.paper,
}));
