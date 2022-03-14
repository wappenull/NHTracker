const STATE_PEEK = 0;
const STATE_READ = 1;
const STATE_IGNORE = 3;
const STATE_FAV = 10;

class Tag
{
    constructor( id, name, category )
    {
        this.id = id;
        this.name = name;
        this.category = category;
    }
}

class Doujinshi
{
    constructor( id, image, name )
    {
        this.id = id;
        this.image = image;
        this.name = name;
        this.tags = [];// TODO
    }
}

class PageLocation
{
    constructor()
    {
        this.bookId = 0;
        this.isIndexPage = false;
        this.pageNumber = 0;
    }
}

// Support both index page and inside page
function ParseBookNumberFromUrl( url )
{
    const IndexOrInsidePageUrlMatcher = /nhentai.net\/g\/([0-9]+)\/([0-9]+)?/;

    let output = new PageLocation();
    if( url == null )
        return output;

    let match = url.match( IndexOrInsidePageUrlMatcher );
    if( match == null || match.length < 2 )
        return output;

    output.bookId = match[1]; // First number capturing group
    if( match[2] != null )
    {
        output.isIndexPage = false;
        output.pageNumber = parseInt( match[2] );
    }
    else
    {
        output.isIndexPage = true;
        output.pageNumber = 0;
    }
    return output;
}

// Wrapper for sendMessage to wait for it response
function SendMessagePromise( item, callback )
{
    return new Promise( ( resolve, reject ) =>
    {
        chrome.runtime.sendMessage( item, response =>
        {
            if( callback != null )
                callback( response );
            resolve();
        } );
    } );
}

function sleep( ms )
{
    return new Promise( resolve => setTimeout( resolve, ms ) );
}
