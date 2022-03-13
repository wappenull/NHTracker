/* Include ////////////////////////////////////////////////////*/

// Dnoe via HTML

/*///////////////////////////////////////////////////////////////////*/

document.getElementById( "update" ).addEventListener( "click", function ()
{
    SetStatusText( "Fetching... (might take a while)" );
    chrome.runtime.sendMessage( { cmd: "getfav" }, ( response ) => OnFavLoaded( response.succeed, response.reason ) );

} );

document.getElementById( "save" ).addEventListener( "click", function ()
{
    chrome.runtime.sendMessage( { cmd: "save" } );

} );

let g_StatusNode = document.getElementById( "nbDoujinshi" );

function SetStatusText( txt )
{
    g_StatusNode.innerHTML = txt;
}

function RefreshPage()
{
    chrome.runtime.sendMessage( { cmd: "getbook" }, ( response ) => 
    {
        let books = response.books;

        let allCount = 0;
        let favCount = 0;
        for( let bookId in books )
        {
            allCount++;
            if( books[bookId] === 2 )
                favCount++;
        }

        SetStatusText( `You have read ${allCount} books, ${favCount} in favorite.` );

        DisplayReadBooks( books );
    } );

}

function OnFavLoaded( succeed, reason )
{
    if( succeed )
        RefreshPage();
    else
        SetStatusText( "Error due to " + reason );
}

function sleep( ms )
{
    return new Promise( resolve => setTimeout( resolve, ms ) );
}

async function DisplayReadBooks( books )
{
    let root = document.getElementById( "bookDisplay" );
    let allIds = Object.keys( books );

    // Sort ascending, but convert to number first
    allIds = allIds.map( ( item ) => parseInt( item ) );
    allIds.sort( ( a, b ) => a - b ); // Sort using number method

    let processLater = [];
    let c = allIds.length;
    for( let i = 0; i < c; i++ )
    {
        let id = allIds[i];
        let state = books[id];

        let line = document.createElement( "div" );
        root.appendChild( line );

        let txt = `${id} Book name`
        line.innerText = txt;

        processLater.push( { line, id, state } );
    }

    c = processLater.length;
    for( let i = 0; i < c; i++ )
    {
        var item = processLater[i];
        await sleep( 20 );
        chrome.runtime.sendMessage( { cmd: "getbookinfo", id: item.id }, ( response ) =>
        {
            if( response === undefined || response.bookInfo === undefined ) return;
            _WriteBookLineInfo( item.line, response.bookInfo, item.state );
        } );
    }

}

function _WriteBookLineInfo( lineNode, bookInfo, state )
{
    let txt = `${bookInfo.id} ${bookInfo.name}`;
    if( state === STATE_FAV )
        txt += " (FAVORITE)";
    lineNode.innerText = txt;
}

RefreshPage();

/*

function UpdateSearchDisabled()
{
    if( document.getElementById( "strictSearch" ).checked )
    {
        document.getElementById( "nbTriesBeforeDefault" ).disabled = false;
        document.getElementById( "defaultSearch" ).disabled = false;
        if( document.getElementById( "defaultSearch" ).checked )
        {
            document.getElementById( "nbTriesBeforeFail" ).disabled = true;
        }
        else
        {
            document.getElementById( "nbTriesBeforeFail" ).disabled = false;
        }
    }
    else
    {
        document.getElementById( "nbTriesBeforeDefault" ).disabled = true;
        document.getElementById( "defaultSearch" ).disabled = true;
        document.getElementById( "nbTriesBeforeFail" ).disabled = false;
        document.getElementById( "defaultSearch" ).checked = false;
        UpdateLogs();
    }
}

document.getElementById( "defaultNormal" ).addEventListener( "click", function ()
{
    document.getElementById( "strictSearch" ).checked = true;
    document.getElementById( "nbTriesBeforeDefault" ).value = 10;
    document.getElementById( "defaultSearch" ).checked = false;
    document.getElementById( "nbTriesBeforeFail" ).value = 10;
    chrome.storage.sync.set( {
        strictSearch: true,
        nbTriesBeforeDefault: 10,
        defaultSearch: false,
        nbTriesBeforeFail: 10
    } );
    UpdateLogs();
    UpdateSearchDisabled();
} );

document.getElementById( "default" ).addEventListener( "click", function ()
{
    document.getElementById( "tagsPerSearch" ).value = 3;
    document.getElementById( "favoriteTags" ).value = 5;
    chrome.storage.sync.set( {
        tagsPerSearch: 3,
        favoriteTags: 5
    } );
    UpdateLogs();
} );

var doujinshiDebug;
function SetDebugLogs( doujinshis )
{
    let html = "";
    doujinshiDebug = doujinshis;
    let items = Object.keys( doujinshis ).map( function ( key )
    {
        return [key, doujinshis[key]];
    } );
    items.sort( function ( first, second )
    {
        if( first[1][0].name < second[1][0].name )
        {
            return -1;
        }
        return 1;
    } );
    items.forEach( function ( elem )
    {
        html += "<button class='" + elem[1][0].category + "' id='" + elem[0] + "'>" + elem[1][0].name + "</button>";
    } );
    document.getElementById( "tagsDisplay" ).innerHTML = html;
    items.forEach( function ( elem )
    {
        document.getElementById( elem[0] ).addEventListener( "click", function ()
        {
            let doujinshi = doujinshiDebug[elem[0]];
            let imageHtml = "Tag: " + doujinshi[0].name + "<br/>";
            for( let i = 1; i < doujinshi.length; i++ )
            {
                let curr = doujinshi[i];
                imageHtml += '<a href="http://nhentai.net/g/' + curr.id + '/" target="_blank"><img src="' + curr.image + '"/></a>';
            }
            document.getElementById( "tagsDisplayImage" ).innerHTML = imageHtml;
        } );
    } );
}

SetDebugLogs( chrome.runtime.getBackgroundPage().GetDoujinshiDebug() );

chrome.runtime.getBackgroundPage().SetSettingsCallback( function ( nb )
{
    document.getElementById( "nbDoujinshi" ).innerHTML = nb + " doujinshis loaded.";
    UpdateLogs();
}, function ( doujinshis )
{
    SetDebugLogs( doujinshis );
} );

chrome.storage.sync.get( {
    doujinshiCount: 0,
    previewImage: "show",
    tagsPerSearch: 3,
    favoriteTags: 5,
    requestsDelay: 500,
    strictSearch: true,
    nbTriesBeforeDefault: 10,
    defaultSearch: false,
    nbTriesBeforeFail: 10
}, function ( elems )
{
    if( elems.doujinshiCount == -1 )
    { // Update in progress...
        document.getElementById( "nbDoujinshi" ).innerHTML = "0 doujinshis loaded.";
    }
    else
    {
        document.getElementById( "nbDoujinshi" ).innerHTML = elems.doujinshiCount + " doujinshis loaded.";
    }
    var select = document.getElementById( 'previewImage' );
    for( var i, j = 0; i = select.options[j]; j++ )
    {
        if( i.value == elems.previewImage )
        {
            select.selectedIndex = j;
            break;
        }
    }
    document.getElementById( "tagsPerSearch" ).value = elems.tagsPerSearch;
    document.getElementById( "favoriteTags" ).value = elems.favoriteTags;
    document.getElementById( "requestsDelay" ).value = elems.requestsDelay;
    document.getElementById( "strictSearch" ).checked = elems.strictSearch;
    document.getElementById( "nbTriesBeforeDefault" ).value = elems.nbTriesBeforeDefault;
    document.getElementById( "defaultSearch" ).checked = elems.defaultSearch;
    document.getElementById( "nbTriesBeforeFail" ).value = elems.nbTriesBeforeFail;

    UpdateLogs();
} );

function UpdateLogs()
{
    chrome.storage.sync.get( {
        doujinshiCount: 0,
        tagsPerSearch: 3,
        favoriteTags: 5,
        requestsDelay: 500,
        strictSearch: true,
        nbTriesBeforeDefault: 10,
        defaultSearch: false,
        nbTriesBeforeFail: 10
    }, function ( elems )
    {
        let logsHtml = "Browser: ";
        if( typeof browser !== "undefined" )
        {
            logsHtml += "Firefox v" + /Firefox\/([0-9.]+)/.exec( navigator.userAgent )[1];
        }
        else
        {
            logsHtml += "Chrome v" + /Chrome\/([0-9.]+)/.exec( navigator.userAgent )[1];
        }
        logsHtml += "\nTags per Search: " + elems.tagsPerSearch;
        logsHtml += "\nFavorite Tags: " + elems.favoriteTags;
        logsHtml += "\nRequests Delay: " + elems.requestsDelay;
        logsHtml += "\nDoujinshi Count: " + elems.doujinshiCount;
        logsHtml += "\nStrict Search: ";
        if( elems.strictSearch )
        {
            logsHtml += elems.nbTriesBeforeDefault;
        }
        else
        {
            logsHtml += "Disabled";
        }
        logsHtml += "\nDefault Search: ";
        if( elems.defaultSearch )
        {
            logsHtml += "Disabled";
        }
        else
        {
            logsHtml += elems.nbTriesBeforeFail;
        }
        document.getElementById( "logs" ).value = logsHtml;
        chrome.runtime.getBackgroundPage().GetTags( function ( tags )
        {
            let items = Object.keys( tags ).map( function ( key )
            {
                return [key, tags[key]];
            } );
            items = items.filter( function ( e ) { return e[0].split( '/' )[0] == "tag"; } );
            logsHtml += "\nTag count (uncategorized): " + items.length;
            logsHtml += "\nTags:\n";
            items.sort( function ( first, second )
            {
                return second[1] - first[1];
            } );
            items = items.splice( 0, elems.favoriteTags );
            logsHtml += JSON.stringify( items );
            document.getElementById( "logs" ).value = logsHtml;
        } );
    } );
}

tagsPerSearch.addEventListener( 'change', function ()
{
    let value = parseInt( document.getElementById( "tagsPerSearch" ).value );
    chrome.storage.sync.get( {
        tagsPerSearch: 3,
        favoriteTags: 5
    }, function ( elems )
    {
        if( !isNaN( value ) && value > 0 && value <= elems.favoriteTags )
        {
            chrome.storage.sync.set( {
                tagsPerSearch: value
            } );
            UpdateLogs();
        }
        else
        {
            document.getElementById( "tagsPerSearch" ).value = elems.tagsPerSearch;
        }
    } );
} );

favoriteTags.addEventListener( 'change', function ()
{
    let value = parseInt( document.getElementById( "favoriteTags" ).value );
    chrome.storage.sync.get( {
        tagsPerSearch: 3,
        favoriteTags: 5
    }, function ( elems )
    {
        if( !isNaN( value ) && value > 0 && value >= elems.tagsPerSearch )
        {
            chrome.storage.sync.set( {
                favoriteTags: value
            } );
            UpdateLogs();
        }
        else
        {
            document.getElementById( "favoriteTags" ).value = elems.favoriteTags;
        }
    } );
} );

requestsDelay.addEventListener( 'change', function ()
{
    let value = parseInt( document.getElementById( "requestsDelay" ).value );
    if( !isNaN( value ) && value >= 0 )
    {
        chrome.storage.sync.set( {
            requestsDelay: value
        } );
        UpdateLogs();
    }
    else
    {
        chrome.storage.sync.get( {
            requestsDelay: 500
        }, function ( elems )
        {
            document.getElementById( "requestsDelay" ).value = elems.requestsDelay;
        } );
    }
} );

nbTriesBeforeDefault.addEventListener( 'change', function ()
{
    let value = parseInt( document.getElementById( "nbTriesBeforeDefault" ).value );
    if( !isNaN( value ) && value >= 0 )
    {
        chrome.storage.sync.set( {
            nbTriesBeforeDefault: value
        } );
        UpdateLogs();
    }
    else
    {
        chrome.storage.sync.get( {
            nbTriesBeforeDefault: 10
        }, function ( elems )
        {
            document.getElementById( "nbTriesBeforeDefault" ).value = elems.nbTriesBeforeDefault;
        } );
    }
} );

nbTriesBeforeFail.addEventListener( 'change', function ()
{
    let value = parseInt( document.getElementById( "nbTriesBeforeFail" ).value );
    if( !isNaN( value ) && value >= 0 )
    {
        chrome.storage.sync.set( {
            nbTriesBeforeFail: value
        } );
        UpdateLogs();
    }
    else
    {
        chrome.storage.sync.get( {
            nbTriesBeforeFail: 10
        }, function ( elems )
        {
            document.getElementById( "nbTriesBeforeFail" ).value = elems.nbTriesBeforeFail;
        } );
    }
} );

strictSearch.addEventListener( 'change', function ()
{
    let value = document.getElementById( "strictSearch" ).checked;
    chrome.storage.sync.set( {
        strictSearch: value
    } );
    UpdateLogs();
    UpdateSearchDisabled();
} );

defaultSearch.addEventListener( 'change', function ()
{
    let value = document.getElementById( "defaultSearch" ).checked;
    chrome.storage.sync.set( {
        defaultSearch: value
    } );
    UpdateLogs();
    UpdateSearchDisabled();
} );

previewImage.addEventListener( 'change', function ()
{
    chrome.storage.sync.set( {
        previewImage: this.options[this.selectedIndex].value
    } );
} );
*/