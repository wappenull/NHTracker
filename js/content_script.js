/* Include ////////////////////////////////////////////////////*/

// Done via manifest

/* Content script /////////////////////////////////////////////////*/

function ParseBookNumberFromUrl( url )
{
    let match = url.match( /nhentai.net\/g\/([0-9]+)\// );
    if( match == null || match.length < 2 )
        return -1;

    let bookNumber = match[1]; // First number capturing group
    return bookNumber;
}

function ParseBookInfoFromPage( doc, id )
{
    let info = new Doujinshi;
    info.id = id;
    info.name = doc.querySelector( "#info > h1 > span.pretty" ).innerText;
    info.image = doc.querySelector( "#cover > a > img" ).src;
    info.tags = []; // no for now

    return info;
}

// Check current book number for this URL
// Write state to 1 (read)
async function CheckPageAndAdd()
{
    // Check that it must be nhentai.net/g/NNNNNNN/
    let bookNumber = ParseBookNumberFromUrl( location.href );
    if( bookNumber === -1 )
    {
        //alert( `This is not a book page` );
        WriteGridResult();
        return;
    }

    let bookInfo = ParseBookInfoFromPage( document, bookNumber );
    
    // Content script cannot access background page, must use messaging
    await chrome.runtime.sendMessage(
        {
            cmd: "setbook",
            id: bookNumber,
            state: STATE_READ,
            info: bookInfo
        } );

    // Book page also has recommendation below, write their state
    WriteGridResult();
}

// Check if current page has linking to another book
// Write state if read or already in fav
function WriteGridResult()
{
    chrome.runtime.sendMessage( { cmd: "getbook" }, ( response ) => 
    {
        let database = response.books;

        let allCovers = document.getElementsByClassName( 'cover' );
        var l = allCovers.length;
        for (let i = 0; i < l; i++)
        {
            var cover = allCovers[i];
            let linkToNumber = ParseBookNumberFromUrl( cover.href );
            if( linkToNumber === -1 )
                continue;

            let state = database[linkToNumber];
            if( state === undefined || state === 0 )
                continue;

            DecorateCoverTagWithState( cover, state );
        }
    } );

}

function DecorateCoverTagWithState( cover, state )
{
    let header = document.createElement( "div" );
    if( state === STATE_READ )
    {
        header.style = "background-color: blue; color: white;";
        header.innerHTML = "READ";
    }
    else if( state === STATE_FAV )
    {
        header.style = "background-color: goldenrod; color: white;";
        header.innerHTML = "IN FAVORITE";
    }

    // Then insert it at the top of cover box
    cover.insertAdjacentElement( 'afterbegin', header );
}

CheckPageAndAdd().then();