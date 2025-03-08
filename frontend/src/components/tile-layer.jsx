// Tile layers
const tileLayers = [
    {id: 'osm', name: 'OpenStreetMap', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'},
    {id: 'satellite', name: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'},
    {id: 'topo', name: 'Topographic', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'},
    {id: 'stadia', name: 'Stadia', url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png'},
    {id: 'stadiadark', name: 'Stadia dark', url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'},
    {id: 'cartodbdark', name: 'CartoDB dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'},
    {id: 'esri', name: 'Esri', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'},
    {id: 'esrigreycanvas', name: 'Esri grey', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'},
    {id: 'geodatenzentrum', name: 'Geodatenzentrum', url: 'http://sgx.geodatenzentrum.de/wmts_topplus_open/tile/1.0.0/web_grau/default/WEBMERCATOR/{z}/{y}/{x}.png'},
    {id: 'cartodbvoyager', name: 'CartoDB Voyager', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png}'}
];


/**
 * Function to get a tile layer by its id.
 * @param {string} id - The id of the tile layer to retrieve.
 * @returns {Object|null} - The tile layer object if found, otherwise null.
 */
export function getTileLayerById(id) {
    return tileLayers.find(layer => layer.id === id) || null;
}

export default tileLayers;