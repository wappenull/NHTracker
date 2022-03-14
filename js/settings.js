/* Include ////////////////////////////////////////////////////*/

// Dnoe via HTML

/*///////////////////////////////////////////////////////////////////*/

document.getElementById( "save" ).addEventListener( "click", function ()
{
    chrome.runtime.sendMessage( { cmd: "save" } );

} );

document.getElementById( "clearStorage" ).addEventListener( "click", function ()
{
    chrome.storage.sync.clear();
    chrome.storage.local.clear();
    setTimeout( RefreshPage, 300 );
} );

let g_StatusNode = document.getElementById( "nbDoujinshi" );

function SetStatusText( txt )
{
    g_StatusNode.innerHTML = txt;
}

let g_DisplayFilter = "default";

function RefreshPage()
{
    chrome.runtime.sendMessage( { cmd: "getbook" }, ( response ) => 
    {
        let books = response.books;

        let allCount = 0;
        let favCount = 0;
        let ignoreCount = 0;
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
        }

        SetStatusText( `You have read ${allCount} books, ${favCount} in favorite. (${ignoreCount} ignored)` );

        DisplayReadBooks( books );
    } );

    WriteStorageInfoText();
}

async function WriteStorageInfoText()
{
    let syncByte = await chrome.storage.sync.getBytesInUse();
    document.getElementById( "syncSpace" ).innerText = `Sync storage ${( syncByte / 1024 ).toFixed( 2 )}K (this stores book read state)`;

    let localByte = await chrome.storage.local.getBytesInUse();
    document.getElementById( "localSpace" ).innerText = `Local storage ${( localByte / 1024 ).toFixed( 2 )}K (this caches book short meta data such as name)`;
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

function RunHistoryCheckUsingGoogleTakeOut( event )
{
    const selectedFile = document.getElementById( "historyFile" ).files[0];
    if( selectedFile != null ) // selectedFile is file object
    {
        let reader = new FileReader();
        reader.onload = function ( e )
        {
            _ProcessHistoryGoogleTakeOut( e.target.result );
        };
        reader.readAsText( selectedFile );
    }
    else
    {
        alert( "File not selected, dont be shy, select one!" );
    }
    event.preventDefault(); // Do not reload the page
}

function RunHistoryCheckUsingLineFile( event )
{
    const selectedFile = document.getElementById( "historyFile2" ).files[0];
    if( selectedFile != null ) // selectedFile is file object
    {
        let reader = new FileReader();
        reader.onload = function ( e )
        {
            _ProcessHistoryLineFile( e.target.result );
        };
        reader.readAsText( selectedFile );
    }
    else
    {
        alert( "File not selected, dont be shy, select one!" );
    }
    event.preventDefault(); // Do not reload the page
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

function sleep( ms )
{
    return new Promise( resolve => setTimeout( resolve, ms ) );
}

async function DisplayReadBooks( bookState )
{
    let root = document.getElementById( "bookDisplay" );
    root.innerHTML = ''; // Clear all children

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

        let txt = `${id}`
        line.innerText = txt;

        processLater.push( { line, id, state } );
    }

    c = processLater.length;
    for( let i = 0; i < c; i++ )
    {
        var item = processLater[i];
        chrome.runtime.sendMessage( { cmd: "getbookinfo", id: item.id }, ( response ) =>
        {
            if( response.bookInfo == null ) return;
            _WriteBookLineInfo( item.line, response.bookInfo, item.state );
        } );
        await sleep( 10 );
    }

}

function _WriteBookLineInfo( lineNode, bookInfo, state )
{
    let txt = `${bookInfo.id} ${bookInfo.name}`;
    if( state === STATE_FAV )
        txt += " (FAVORITE)";
    if( state === STATE_IGNORE )
        txt += " (IGNORED)";
    lineNode.innerText = txt;
}

/* Option service //////////////////////////////////////////////////////*/

bookDisplayType.addEventListener( 'change', function ()
{
    g_DisplayFilter = this.options[this.selectedIndex].value;
    RefreshPage();
} );

/* Page init //////////////////////////////////////////////////////////*/
RefreshPage();
