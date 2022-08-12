/* Include ////////////////////////////////////////////////////*/

// Dnoe via HTML

/*///////////////////////////////////////////////////////////////////*/

//document.getElementById( "save" ).addEventListener( "click", function ()
//{
//    chrome.runtime.sendMessage( { cmd: "save" } );

//} );

document.getElementById( "clearStorage" ).addEventListener( "click", function ()
{
    chrome.runtime.sendMessage( { cmd: "wipe" } );
    setTimeout( RefreshPage, 300 );
} );

let g_StatusNode = document.getElementById( "nbDoujinshi" );
let g_StatusNode2 = document.getElementById( "statusText2" );

function SetStatusText( txt )
{
    g_StatusNode.innerHTML = txt;
}

function SetStatusText2( txt )
{
    g_StatusNode2.innerHTML = txt;
}

async function WriteStorageInfoText()
{
    let syncByte = await chrome.storage.sync.getBytesInUse();
    document.getElementById( "syncSpace" ).innerText = `Sync storage ${( syncByte / 1024 ).toFixed( 2 )}K (v1.1.x does not use this anymore because of very limited space)`;

    let localByte = await chrome.storage.local.getBytesInUse();
    document.getElementById( "localSpace" ).innerText = `Local storage ${( localByte / 1024 ).toFixed( 2 )}K`;
}

/* Favorite fetching ///////////////////////////////////////////////*/

document.getElementById( "update" ).addEventListener( "click", function ()
{
    SetStatusText( "Fetching... (might take a while)" );
    chrome.runtime.sendMessage( { cmd: "getfav" }, ( response ) => OnFavLoaded( response.succeed, response.reason ) );

} );

function OnFavLoaded( succeed, reason )
{
    if( succeed )
    {
        alert( `Done, ${reason} books fetched from favorite.` );
        RefreshPage();
    }
    else
    {
        SetStatusText( "Error due to " + reason );
    }
}

/* History submit service ////////////////////////////////////////////////*/

document.getElementById( "historySubmit" ).addEventListener( "submit", RunHistoryCheckUsingGoogleTakeOut );
document.getElementById( "historySubmit2" ).addEventListener( "submit", RunHistoryCheckUsingLineFile );

function _LoadFileFromFileElement( elementId, callback )
{
    const selectedFile = document.getElementById( elementId ).files[0];
    if( selectedFile != null ) // selectedFile is file object
    {
        let reader = new FileReader();
        reader.onload = function ( e )
        {
            callback( e.target.result );
        };
        reader.readAsText( selectedFile );
    }
    else
    {
        alert( "File not selected, dont be shy, select one!" );
    }
    event.preventDefault(); // Do not reload the page
}

function RunHistoryCheckUsingGoogleTakeOut( event )
{
    _LoadFileFromFileElement( "historyFile", _ProcessHistoryGoogleTakeOut );
}

function RunHistoryCheckUsingLineFile( event )
{
    _LoadFileFromFileElement( "historyFile2", _ProcessHistoryLineFile );
}

/*
 * File look like this
 * {
    "Browser History": [
        {
            "favicon_url": "https://nhentai.net/favicon.ico",
            "page_transition": "RELOAD",
            "title": "Asa Okitara Imouto ga Hadaka Apron Sugata datta node Hamete Mita | I Woke Up to my Naked Apron Sister and Tried Fucking Her - Ch.2 » nhentai: hentai doujinshi and manga",
            "url": "https://nhentai.net/g/394923/",
            "client_id": "xPuNMd8l0AefScLPuV8eYA==",
            "time_usec": 1647165548781917
        },
 * */
function _ProcessHistoryGoogleTakeOut( text )
{
    var obj = null;
    try
    {
        obj = JSON.parse( text );
    } catch( _ ) { }

    if( obj == null )
    {
        alert( "Not valid JSON" );
        return;
    }

    obj = obj["Browser History"]; // This resolve to an array
    if( obj == null )
    {
        alert( "Not valid Google Browser History file" );
        return;
    }

    let seen = {};
    let c = obj.length;
    for( let i = 0; i < c; i++ )
    {
        let entry = obj[i];
        // Inspect this URL
        let page = ParseBookNumberFromUrl( entry.url );
        if( page.bookId == 0 )
            continue;

        // Write into this in case there is dupe URL
        seen[page.bookId] = 1;
    }

    alert( "Imported total " + Object.keys( seen ).length + " entire(s)." );

    for( let bookId in seen )
    {
        chrome.runtime.sendMessage(
            {
                cmd: "setbook",
                id: bookId,
                state: STATE_READ,
                info: null // Have no info at this moment
            } );
    }

    sleep( 100 ).then( RefreshPage );
}

function _ProcessHistoryLineFile( text )
{
    // read each line then scan for URL
    let lines = text.split( /\r?\n/ );

    let seen = {};
    let c = lines.length;
    for( let i = 0; i < c; i++ )
    {
        let line = lines[i];

        // Inspect this URL
        let page = ParseBookNumberFromUrl( line );
        if( page.bookId == 0 )
            continue;

        // Write into this in case there is dupe URL
        seen[page.bookId] = 1;
    }

    alert( "Imported total " + Object.keys( seen ).length + " entire(s)." );

    for( let bookId in seen )
    {
        chrome.runtime.sendMessage(
            {
                cmd: "setbook",
                id: bookId,
                state: STATE_READ,
                info: null // Have no info at this moment
            } );
    }

    sleep( 100 ).then( RefreshPage );
}

/* Book listing ////////////////////////////////////*/

bookDisplayType.addEventListener( 'change', function ()
{
    g_DisplayFilter = this.options[this.selectedIndex].value;

    // Also save this new option
    chrome.storage.local.set( { g_DisplayFilter } );
    RefreshPage();
} );

let g_DisplayFilter = null;

function RefreshPage()
{
    // Write extension version
    {
        var manifestData = chrome.runtime.getManifest();
        document.getElementById( "version" ).innerText = "v" + manifestData.version;
    }

    WriteStorageInfoText();

    chrome.runtime.sendMessage( { cmd: "getbook" }, ( response ) => 
    {
        let books = response.books;

        let allCount = 0;
        let favCount = 0;
        let ignoreCount = 0;
        let toreadCount = 0;

        for( let bookId in books )
        {
            let state = books[bookId];
            if( state == null || state === 0 )
                continue;

            allCount++;
            if( state === STATE_FAV )
                favCount++;
            else if( state === STATE_IGNORE )
                ignoreCount++;
            else if( state === STATE_TOREAD )
                toreadCount++;
        }

        SetStatusText( `You have read ${allCount} books, ${favCount} in favorite. (${toreadCount} in reading queue) (${ignoreCount} ignored) Info available ${allCount}` );

        DisplayReadBooks( books );
    } );
}

async function DisplayReadBooks( bookState )
{
    let root = document.getElementById( "bookDisplay" );
    root.innerHTML = ''; // Clear all children

    // If this is first run, g_DisplayFilter will be null on page load
    // Check for previous value in storage
    if( g_DisplayFilter == null )
    {
        // Ask from last time, or default to "default" filter
        let save = await chrome.storage.local.get( { g_DisplayFilter: "default" } );
        g_DisplayFilter = save["g_DisplayFilter"];
        bookDisplayType.value = g_DisplayFilter;
    }

    let allIds = Object.keys( bookState );

    // Sort ascending, but convert to number first
    allIds = allIds.map( ( item ) => parseInt( item ) );
    allIds.sort( ( a, b ) => a - b ); // Sort using number method

    let processLater = [];
    let c = allIds.length;
    for( let i = 0; i < c; i++ )
    {
        let id = allIds[i];
        if( id == null || id == 0 )  // ID zero is never shown
            continue;

        // Check with filter
        let state = bookState[id];
        if( state == null || state === 0 )
            continue; // Book can be in Unread (0) state by index page selector override, filter it out

        if( g_DisplayFilter === "fav" )
        {
            if( state !== STATE_FAV )
                continue;
        }
        else if( g_DisplayFilter === "toread" )
        {
            if( state !== STATE_TOREAD )
                continue;
        }
        else if( g_DisplayFilter === "ignore" )
        {
            if( state !== STATE_IGNORE )
                continue;
        }
        else // Default filter
        {
            // Filter only these
            if( state !== STATE_READ && state !== STATE_FAV )
                continue;
        }

        let line = document.createElement( "div" );
        root.appendChild( line );

        let link = document.createElement( "a" );
        line.appendChild( link );
        link.textContent = id;
        link.href = "https://nhentai.net/g/" + id;
        link.target = "_blank"; // Open in new tab

        let text = document.createTextNode( "" );
        line.appendChild( text );
        processLater.push( { line: text, id, state } );
    }

    _QueryBookInfoForList( processLater );
}

let g_QueryJobId = 0;
async function _QueryBookInfoForList( list )
{
    // While for loop is running on very long list, user could change filter option
    // Will use g_QueryJobId to check if this job can be terminated
    // Every new call to _QueryBookInfoForList will increment to new job id
    const thisJobId = ++g_QueryJobId;
    const c = list.length;
    let haveInfo = 0;
    for( let i = 0; i < c; i++ )
    {
        if( g_QueryJobId != thisJobId ) break;

        let item = list[i];
        await SendMessagePromise( { cmd: "getbookinfo", id: item.id }, ( response ) =>
        {
            if( g_QueryJobId != thisJobId ) return;
            if( item.line == null ) return; // Maybe destroyed from switching
            if( response.bookInfo == null ) return;

            haveInfo++;
            _WriteBookLineInfo( item.line, response.bookInfo, item.state );
        } );

        SetStatusText2( `Book info available ${haveInfo}/${c}` );
    }
}

function _WriteBookLineInfo( textNode, bookInfo, state )
{
    let txt = " " + bookInfo.name;
    if( state === STATE_FAV )
        txt += " (FAVORITE)";
    if( state === STATE_IGNORE )
        txt += " (IGNORED)";
    if( state === STATE_TOREAD )
        txt += " (TO READ LATER)";
    textNode.textContent = txt;
}

/* Import export service ///////////////////////////////////////////////*/

document.getElementById( "exportData" ).addEventListener( "click", ExportUserData );
document.getElementById( "importData" ).addEventListener( "click", ImportUserData );

function ExportUserData()
{
    chrome.runtime.sendMessage( { cmd: "dump" }, ( response ) => 
    {
        let books = response.books; // Book state
        let db = response.db; // Book info db
        let json = JSON.stringify( { books, db } );
        let blob = new Blob( [json], { type: "text/plain" } );
        var url = URL.createObjectURL( blob );
        chrome.downloads.download( {
            url: url,
            filename: "NHTrackerData.json",
            saveAs: true // Download using save as dialog
        } );
    } );
}

function ImportUserData()
{
    _LoadFileFromFileElement( "importFile", _ProcessImportUserData );
}

function _ProcessImportUserData( text )
{
    try
    {
        let obj = JSON.parse( text );
        if( obj.books != null && obj.db != null )
        {
            chrome.runtime.sendMessage( { cmd: "importDump", books: obj.books, db: obj.db } );
            alert( 
                `Merged ${Object.keys(obj.books).length} books state, ${Object.keys(obj.db).length} DB entires.` +
                "\nNote that this is a merge operation, if you wish to start new, wipe data then import again."
                );
            setTimeout( RefreshPage, 300 );
        }
        else
        {
            throw false;
        }
    }
    catch( e )
    {
        alert( "File is not valid NHTracker save file" );
    }
}

/* Page init //////////////////////////////////////////////////////////*/
RefreshPage();
