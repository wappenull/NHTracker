/* Include ////////////////////////////////////////////////////*/

try
{
    importScripts( '/js/include.js', '/js/lz-string.js' );
}
catch( e )
{
    console.error( e );
}

/* Background worker ////////////////////////////////////////////*/

// All read book numbers
// Key: string book number
// Value: int book state, see STATE_READ
let g_ReadBooks = {};

// Basic book data such as name or image
// Get updated only in occasion that plugin come into contact with such info
// Key: string book number
// Value: Doujinshi object
let g_BookDb = {};

chrome.action.onClicked.addListener( ( tab ) => 
{
    chrome.runtime.openOptionsPage();
} );

chrome.runtime.onInstalled.addListener( () =>
{

} );

chrome.runtime.onSuspend.addListener( () =>
{
    SaveDatabase();
} );

const SAVE_INTERVAL = 60;
let g_SaveCountdown = SAVE_INTERVAL;

function OnUpdateFunction()
{
    const dt = 2;
    g_SaveCountdown -= dt;
    if( g_SaveCountdown <= 0 )
    {
        SaveDatabase();
        g_SaveCountdown = SAVE_INTERVAL;

    }
    setTimeout( OnUpdateFunction, dt * 1000 ); // Recall this after some time
}

chrome.runtime.onMessage.addListener( _OnMessage );

function _OnMessage( request, sender, sendResponse )
{
    //console.log( "onMessage ", request, sender.tab ? "from a content script:" + sender.tab.url : "from the extension" );
    if( request.cmd === "setbook" )
    {
        if( request.info != null )
            SetBookInfo( request.info );
        SetBookState( request.id, request.state, request.force );
    }
    else if( request.cmd == "getbook" )
    {
        sendResponse( { books: g_ReadBooks } );
    }
    else if( request.cmd == "getfav" )
    {
        LoadFavorites( ( succeed, reason ) => sendResponse( { succeed, reason } ) );
        return true; // This is async request, it took long
    }
    else if( request.cmd == "getbookinfo" )
    {
        GetBookInfo( request.id, ( bookInfo ) => sendResponse( { bookInfo } ) );
        return true;
    }
    else if( request.cmd == "save" )
    {
        g_BookStateDirty = true;
        g_DbStateDirty = true;
        SaveDatabase();
    }
    else if( request.cmd == "bookinfohint" )
    {
        if( request.info != null )
        {
            // Only write if we have seen this book in state
            let bookInfo = request.info;
            let state = g_ReadBooks[bookInfo.id];
            if( state != null && state > 0 )
                SetBookInfo( request.info );
        }
    }
    
}


function InitDatabase()
{
    SyncGetPartitioned( "books",
        function ( save ) 
        {
            if( save.books == null ) return;
            g_ReadBooks = save.books;
            console.log( 'InitDatabase books: ', Object.keys( g_ReadBooks ).length );
        } );
    SyncGetPartitioned( "bookdb",
        function ( save )
        {
            if( save.bookdb == null ) return;
            g_BookDb = save.bookdb;
            console.log( 'InitDatabase bookdb: ', Object.keys( g_BookDb ).length );
        }, "local" );
}

let g_BookStateDirty = false;
let g_DbStateDirty = false;

function SaveDatabase()
{
    if( g_BookStateDirty )
        SyncStorePartitioned( "books", g_ReadBooks );
    if( g_DbStateDirty )
        SyncStorePartitioned( "bookdb", g_BookDb, "local" );

    g_BookStateDirty = false;
    g_DbStateDirty = false;
}

function SetBookState( id, targetState, force )
{
    if( targetState === undefined )
        targetState = STATE_READ;

    let state = g_ReadBooks[id];
    if( force || (state === undefined || targetState > state) ) // Write if blank, or state is higher
    {
        g_ReadBooks[id] = targetState;
        g_BookStateDirty = true;
    }
}

const BookInfoDbPrefix = "bookinfo_";

function SetBookInfo( bookInfo )
{
    // bookInfo object must have id, name field
    if( bookInfo == null || bookInfo.id == null || bookInfo.name == null )
    {
        console.error( "SetBookInfo passes invalid argument bookInfo", bookInfo );
        return;
    }

    console.log( "save book info for", bookInfo.id );
    g_BookDb[bookInfo.id] = bookInfo;
    g_DbStateDirty = true;
}

// Request book db info, search cache or fire API.
// callback with Doujinshi object
function GetBookInfo( id, callback )
{
    if( g_BookDb[id] !== undefined )
    {
        callback( g_BookDb[id] );
    }

    // TODO: Fire nhentai API and cache
    callback( undefined );
}

InitDatabase();
OnUpdateFunction();

/* Helper for storage partitioning //////////////////////////////////*/

function _MakeStoreSegmentName( key, index )
{
    return key + "_" + index;
}

function SyncStorePartitioned( key, objectToStore, storageApi )
{
    let i = 0;
    let segmentName = "";
    let storage = {};
    let str = JSON.stringify( objectToStore );

    if( storageApi === "local" )
        storageApi = chrome.storage.local;
    else
        storageApi = chrome.storage.sync;

    // Technical note: if string contains a lot of escape character, re-json it will produce more escape character
    // Better gzip that
    str = LZString.compressToBase64( str );
    const LIMIT = chrome.storage.sync.QUOTA_BYTES_PER_ITEM - key.length - 16; // Reserve 16 byte for safer margin

    while( str.length > 0 )
    {
        segmentName = _MakeStoreSegmentName( key, i );
        let thisCycle = str.length;
        if( thisCycle > LIMIT )
            thisCycle = LIMIT;
        storage[segmentName] = str.substr( 0, thisCycle );
        str = str.substring( thisCycle, str.length ); // Next part
        i++;
    }

    // As how the fetching logic will work in reverse
    // Also make sure that next i+1 chunk remain saved as empty string to know that this is terminal
    // This is also required if new saving data size is shrinking from previous (has fewer chunk count)
    segmentName = _MakeStoreSegmentName( key, i );
    storage[segmentName] = "";

    // Store all chunks
    storageApi.set( storage );
}

function SyncGetPartitioned( key, callback, storageApi )
{
    if( storageApi === "local" )
        storageApi = chrome.storage.local;
    else
        storageApi = chrome.storage.sync;

    _SyncGetPartitionedInternal( key, 0, "", callback, storageApi );
}

function _SyncGetPartitionedInternal( key, index, str, callback, storageApi )
{
    let segmentName = _MakeStoreSegmentName( key, index );
    storageApi.get( segmentName, function ( elems )
    {
        let data = elems[segmentName];
        if( data === undefined || data === "" ) // Found terminal
        {
            try
            {
                str = LZString.decompressFromBase64( str );

                // Send combined result
                // But return it as same format of which storage would do
                let obj = {};
                obj[key] = JSON.parse( str );
                callback( obj );
            }
            catch( error )
            {
                console.log( "Error in parsing data from storage", key, error );
                callback( undefined );
            }
        }
        else
        {
            // Deeper!
            _SyncGetPartitionedInternal( key, index + 1, str + data, callback, storageApi );
        }
    } );
}

/* Fetching favorite //////////////////////////////////////////////*/

let g_FavAdded = 0;

function LoadFavorites( callback )
{
    g_FavAdded = 0;
    fetch( "https://nhentai.net/favorites/" )
        .then( ( response ) =>
        {
            if( response.status === 429 )
            {
                //loadingCallback( undefined ); // Not logged in
                Promise.reject( new Error( "Not logged in" ) );
            }
            else if( response.status === 200 )
            {
                LoadFavoritePage( 1, callback );
            }
            else
            {
                Promise.reject( new Error( response.statusText ) );
                console.error( "Error while loading doujinshi count (Code " + this.status + ")." );
            }
        } ).
        catch( ( error ) =>
        {
            console.error( "Error while loading doujinshi count (Code " + error + ")." );

            callback( false, error );
        } );
}

/// Load one page of favorite into storage
function LoadFavoritePage( pageNumber, callback )
{
    let target = "https://nhentai.net/favorites/?page=" + pageNumber;
    console.log( "Fetch", target );

    fetch( target )
        .then( ( response ) =>
        {
            if( response.status === 200 )
                return response.text();
            else
                Promise.reject( new Error( response.statusText ) );
        } )
        .then( ( text ) =>
        {
            let books = GetDoujinshisFromHtml( text );
            books.forEach( ( book ) => 
            {
                g_FavAdded++;
                SetBookInfo( book );
                SetBookState( book.id, STATE_FAV );
            } );

            if( books.length > 0 )
                LoadFavoritePage( pageNumber + 1, callback );
            else
                callback( true, g_FavAdded );
        } )
        .catch( ( error ) => 
        {
            console.error( "Error while loading favorites page " + pageNumber + " (Code " + error + ")." );
        } );

}

/// Get all doujinshis that are in a page, return an array of Doujinshi
function GetDoujinshisFromHtml( html )
{
    let currDoujinshis = [];
    html.split( '<div class="gallery"' ).slice( 1 ).forEach( e =>
    {
        let match = e.match( /<a href="\/g\/([0-9]+)\/".+img src="([^"]+)".+<div class="caption">([^<]+)<\/div>/ )
        let image = match[2];
        if( image.startsWith( "//" ) )
        {
            image = "https:" + image;
        }
        currDoujinshis.push( new Doujinshi( match[1], image, match[3] ) );
    } );
    return currDoujinshis;
}

/*
let g_doujinshis = []; // User's favorite doujinshis
let g_tagsCount = {}; // In all favorite doujinshi, number of occurance for each tags
let g_blacklistTags = [];
let g_doujinshiDebug = {};
let g_suggestedDoujinshi = undefined;
var loadingCallback = undefined;
var doujinshiCallback = undefined;
var settingsDoujinshiCallback = undefined;
var settingsDebugCallback = undefined;

function SetLoadingCallback( callbackTags, callbackDoujinshi )
{
    loadingCallback = callbackTags;
    doujinshiCallback = callbackDoujinshi;
}

function SetSettingsCallback( callbackDoujinshi, callbackDebug )
{
    settingsDoujinshiCallback = callbackDoujinshi;
    settingsDebugCallback = callbackDebug;
}

function CheckForUpdates()
{
    let http = new XMLHttpRequest();
    http.onreadystatechange = function ()
    {
        if( this.readyState === 4 )
        {
            if( this.status === 200 )
            {
                if( this.responseText.includes( '<span class="count">' ) )
                {
                    let match = /<span class="count">\(([0-9]+)\)<\/span>/.exec( this.responseText );
                    let doujinshiCount = parseInt( match[1] );
                    let responseText = this.responseText;
                    chrome.storage.sync.get( {
                        doujinshiCount: 0
                    }, function ( elems )
                    {
                        if( doujinshiCount !== elems.doujinshiCount )
                        {
                            g_doujinshis = [];
                            g_tagsCount = {};
                            g_doujinshiDebug = {};
                            LoadBlacklistedTags( responseText );
                            LoadFavoritePage( 1 );
                        }
                    } );
                }
            }
            else
            {
                console.error( "Error while loading doujinshi count (Code " + this.status + ")." );
            }
        }
    };
    http.open( "GET", "https://nhentai.net/favorites/", true );
    http.send();
}

function LoadBlacklistedTags( html )
{
    g_blacklistTags = JSON.parse( /blacklisted_tags: (\[[^\]]*\])/.exec( html )[1] );
}

function GetRandomDoujinshi( url, callback )
{
    let http = new XMLHttpRequest();
    http.onreadystatechange = function ()
    {
        if( this.readyState === 4 )
        {
            if( this.status === 200 )
            {
                let match = /\?q=[^&]+&amp;page=([0-9]+)" class="last">/.exec( this.responseText );
                let maxPage = parseInt( match[1] );
                GetRandomDoujinshiFromPage( url + "&page=" + ( Math.floor( Math.random() * maxPage ) + 1 ), callback );
            }
            else
            {
                console.error( "Error while loading page " + url + " (Code " + this.status + ")." );
            }
        }
    };
    http.open( "GET", url, true );
    http.send();
}

/// Get a random doujinshi from a page
function GetRandomDoujinshiFromPage( url, callback )
{
    let http = new XMLHttpRequest();
    http.onreadystatechange = function ()
    {
        if( this.readyState === 4 )
        {
            if( this.status === 200 )
            {
                let doujinshis = GetDoujinshisFromHtml( this.responseText );
                GetRandomDoujinshiFromList( doujinshis, 0, callback, true );
            }
            else
            {
                console.error( "Error while loading page " + url + " (Code " + this.status + ")." );
            }
        }
    };
    http.open( "GET", url, true );
    http.send();
}

function GetRandomDoujinshiFromList( doujinshis, nbTries, callback, strictSearch )
{
    currDoujinshi = doujinshis[Math.floor( Math.random() * doujinshis.length )];
    CheckDoujinshiValid( currDoujinshi, function ()
    {
        g_suggestedDoujinshi = currDoujinshi;
        callback( g_suggestedDoujinshi, strictSearch );
    }, function ()
    {
        chrome.storage.sync.get( {
            requestsDelay: 500,
            strictSearch: true,
            nbTriesBeforeDefault: 10,
            defaultSearch: false,
            nbTriesBeforeFail: 10
        }, function ( elems )
        {
            let maxNbOfTries = 0;
            if( elems.strictSearch )
            {
                maxNbOfTries = elems.nbTriesBeforeDefault;
            }
            if( !elems.defaultSearch )
            {
                maxNbOfTries += elems.nbTriesBeforeFail;
            }
            if( nbTries >= maxNbOfTries )
            {
                callback( undefined );
            }
            else
            {
                setTimeout( function ()
                {
                    if( elems.strictSearch && nbTries < elems.nbTriesBeforeDefault )
                    {
                        GetRandomDoujinshiFromList( doujinshis, nbTries + 1, callback, true );
                    }
                    else
                    {
                        GetRandomDoujinshiFromList( doujinshis, nbTries + 1, callback, false );
                    }
                }, elems.requestsDelay );
            }
        } );
    }, strictSearch );
}

/// Check if a doujinshi contains the right tags
function CheckDoujinshiValid( doujinshi, callbackSuccess, callbackFailure, strictSearch )
{
    let http = new XMLHttpRequest();
    http.onreadystatechange = function ()
    {
        if( this.readyState === 4 )
        {
            if( this.status === 200 )
            {
                LoadTagsInternal( 0, "", function ( tags )
                {
                    let isError = false;
                    let httpTags = JSON.parse( http.responseText ).tags;
                    for( let i = 0; i < httpTags.length; i++ )
                    {
                        let elem = httpTags[i];
                        if( ( strictSearch && elem.type == "tag" && !Object.keys( tags ).includes( 'tag/' + elem.name ) ) ||
                            ( !strictSearch && g_blacklistTags.includes( elem.id ) ) )
                        {
                            callbackFailure();
                            isError = true;
                            return;
                        }
                    }
                    if( !isError )
                    {
                        callbackSuccess();
                    }
                } );
            }
            else
            {
                console.error( "Error while loading doujinshi " + doujinshi.id + " (Code " + this.status + ")." );
            }
        }
    };
    http.open( "GET", "https://nhentai.net/api/gallery/" + + doujinshi.id, true );
    http.send();
}

/// Check all doujinshi and get their tags to store them
function StoreTags( index )
{ // We wait 500 ms before checking each page so the API doesn't return a 50X error
    chrome.storage.sync.get( {
        requestsDelay: 500
    }, function ( elems )
    {
        setTimeout( function ()
        {
            let id = g_doujinshis[index].id;
            let http = new XMLHttpRequest();
            http.onreadystatechange = function ()
            {
                if( this.readyState === 4 )
                {
                    if( this.status === 200 )
                    {
                        let httpTags = JSON.parse( this.responseText ).tags;
                        for( let i = 0; i < httpTags.length; i++ )
                        {
                            let elem = httpTags[i];
                            if( g_blacklistTags.includes( elem.id ) )
                            { // Ignore tags that were blacklisted
                                continue;
                            }
                            let tag = new Tag( elem.id, elem.name, elem.type );
                            let tagId = elem.type + "/" + elem.name;
                            if( g_tagsCount[tagId] === undefined )
                            {
                                g_tagsCount[tagId] = 1;
                                g_doujinshiDebug[tag.id] = [tag, g_doujinshis[index]];
                            }
                            else
                            {
                                g_tagsCount[tagId]++;
                                if( !g_doujinshiDebug[tag.id].includes( g_doujinshis[index] ) )
                                {
                                    g_doujinshiDebug[tag.id].push( g_doujinshis[index] );
                                }
                            }
                        }
                        try
                        {
                            if( settingsDebugCallback !== undefined )
                            {
                                settingsDebugCallback( g_doujinshiDebug );
                            }
                        } catch( _ ) { } // Dead object
                        try
                        {
                            if( loadingCallback !== undefined )
                            {
                                loadingCallback( GetTagsCount() );
                            }
                        } catch( _ ) { } // Dead object
                        if( index + 1 < g_doujinshis.length )
                        {
                            StoreTags( index + 1 );
                        }
                        else
                        {
                            StoreTagsName();
                            try
                            {
                                if( loadingCallback !== undefined )
                                {
                                    loadingCallback( -1 );
                                }
                            } catch( _ ) { } // Dead object
                        }
                    }
                    else
                    {
                        console.error( "Error while loading doujinshi page " + doujinshiId + " (Code " + this.status + ")." );
                    }
                }
            };
            http.open( "GET", "https://nhentai.net/api/gallery/" + id, true );
            http.send();
        }, elems.requestsDelay );
    } );
}

function LoadTagsInternal( index, str, callback )
{
    chrome.storage.sync.get( ['tags' + index], function ( elems )
    {
        if( elems['tags' + index] === undefined )
        {
            callback( JSON.parse( str ) );
        }
        else
        {
            LoadTagsInternal( index + 1, str + elems['tags' + index], callback );
        }
    } );
}

/// Store tags into storage, making sure it doesn't mess with QUOTA_BYTES_PER_ITEM
function StoreTagsName()
{
    CleanTagsInternal( 0, function ()
    {
        let i = 0;
        let storage = {};
        let str = JSON.stringify( g_tagsCount );
        while( str.length > chrome.storage.sync.QUOTA_BYTES_PER_ITEM / 2 )
        {
            storage["tags" + i] = str.substr( 0, chrome.storage.sync.QUOTA_BYTES_PER_ITEM / 2 );
            str = str.substring( chrome.storage.sync.QUOTA_BYTES_PER_ITEM / 2, str.length );
            i++;
        }
        storage["tags" + i] = str;
        chrome.storage.sync.set( storage );
    } );
}

function CleanTagsInternal( index, callback )
{
    chrome.storage.sync.get( ['tags' + index], function ( elems )
    {
        if( elems['tags' + index] === undefined )
        {
            callback();
        }
        else
        {
            let storage = {};
            storage["tags" + index] = "";
            chrome.storage.sync.set( storage );
            CleanTagsInternal( index + 1, callback );
        }
    } );
}

function GetTagsCount()
{
    let items = Object.keys( g_tagsCount ).map( function ( key )
    {
        return [key, g_tagsCount[key]];
    } );
    items = items.filter( function ( e ) { return e[0].split( '/' )[0] == "tag"; } );
    return items.length;
}

function GetTags( callback )
{
    LoadTagsInternal( 0, "", function ( tags )
    {
        callback( tags );
    } );
}

function GetSuggestion()
{
    return g_suggestedDoujinshi;
}

function GetDoujinshiDebug()
{
    return g_doujinshiDebug;
}




*/