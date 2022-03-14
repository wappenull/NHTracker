/* Include ////////////////////////////////////////////////////*/

// Done via manifest

/* Content script /////////////////////////////////////////////////*/

let g_IndexPageInfo = new PageLocation();
let g_BookList = {};

function ParseBookInfoFromIndexPage( doc, id )
{
    let info = new Doujinshi();
    info.id = id;
    info.name = doc.querySelector( "#info > h1 > span.pretty" ).innerText;
    info.image = doc.querySelector( "#cover > a > img" ).src;
    info.tags = []; // no for now

    return info;
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

// Check current book number for this URL
async function CheckPageAndAdd()
{
    // Check that it must be nhentai.net/g/NNNNNNN/
    let page = ParseBookNumberFromUrl( location.href );
    g_IndexPageInfo = page;

    let bookInfo = null;
    let state = 0;

    // If in the reading sub page
    if( page.pageNumber > 0 )
        state = STATE_READ;

    // Snatch book info if this is index page
    if( page.isIndexPage )
    {
        bookInfo = ParseBookInfoFromIndexPage( document, page.bookId );

        // Check if fav button is written 'Unfavorite' that's mean we fav this one
        let favTextNode = document.querySelector( "#favorite>.text" );
        if( favTextNode != null )
        {
            if( favTextNode.innerText.includes( "Unfav" ) )
                state = STATE_FAV; // Change to fav state now

            // Also add a monitor, check for text change from NH doing instead, it is faster than guessing the delay
            favTextNode.addEventListener( "DOMSubtreeModified", () => _OnFavStateChanged( favTextNode ) );
        }
    }

    if( page.bookId > 0 )
    {
        // Content script cannot access background page, must use messaging
        // Even if state == 0, it still update book info
        chrome.runtime.sendMessage(
            {
                cmd: "setbook",
                id: page.bookId,
                state: state,
                info: bookInfo
            } );
    }

    // Acquire book state into global var
    await AcquireGlobalBookState();

    if( page.isIndexPage )
    {
        // index page also has recommendation below, write their state
        WriteGridResult( g_BookList, true );

        let state = g_BookList[g_IndexPageInfo.bookId];
        WriteIndexPageTool( state );
    }
    else // Could be a search result or main page
    {
        WriteGridResult( g_BookList, true );
    }

    g_CheckPageAndAddRunOnce = true;
}

function _OnFavStateChanged( favTextNode )
{
    if( g_IndexPageInfo == null )
        return;

    let newState = STATE_READ;
    if( favTextNode.innerText.includes( "Unfav" ) )
        newState = STATE_FAV;
    SetBookCoverState( g_IndexPageInfo.bookId, g_IndexPageCover, newState, true );
}

async function AcquireGlobalBookState()
{
    await SendMessagePromise( { cmd: "getbook" }, ( response ) => g_BookList = response.books );
}

// Check if current page has linking to another book
// Write state if read or already in fav
function WriteGridResult( database, sendBookInfoHint )
{
    if( sendBookInfoHint == null )
        sendBookInfoHint = false;

    let allCovers = document.getElementsByClassName( 'cover' );
    allCovers = Array.from( allCovers ); // Note: allCovers is dynamic array, it could expand if new cover class is added later, so take snapshot of it
    let c = allCovers.length;
    for( let i = 0; i < c; i++ ) 
    {
        let cover = allCovers[i];
        let page = ParseBookNumberFromUrl( cover.href );
        if( page.bookId == 0 )
            continue;

        if( sendBookInfoHint )
        {
            // Auto send book hint to background service
            // In case it discover some book that does not seen meta data yet
            let bookInfo = ParseBookInfoFromCoverNode( cover, page.bookId );
            chrome.runtime.sendMessage( { cmd: "bookinfohint", info: bookInfo } );
        }

        let state = database[page.bookId];
        DecorateCoverWithState( page.bookId, cover, state );
    }
}

function CreateMarkButtonForCover( coverNode, state, bookId )
{
    let div = null;
    let needToshowButton = false;

    if( state == null || state == 0 )
        needToshowButton = true;

    // Try existing one first
    div = coverNode.getElementsByClassName( "coverButtonRoot" )[0];
    if( needToshowButton && div == null )
    {
        // Create
        div = document.createElement( 'div' );
        coverNode.insertAdjacentElement( 'afterbegin', div ); // As first child
        div.id = div.className = "coverButtonRoot";

        let b = document.createElement( "button" );
        b.innerText = "Mark READ";
        b.className = "coverButton read";
        div.appendChild( b );
        let thisBookId = bookId;
        b.addEventListener( "click", ( e ) => 
        {
            SetBookCoverState( thisBookId, coverNode, STATE_READ );
            div.remove(); // Eject entire div root
            e.preventDefault(); // Do not jump for link
        } );

        b = document.createElement( "button" );
        b.innerText = "IGNORE";
        b.className = "coverButton ignore";
        div.appendChild( b );
        b.addEventListener( "click", ( e ) => 
        {
            SetBookCoverState( thisBookId, coverNode, STATE_IGNORE );
            div.remove(); // Eject entire div root
            e.preventDefault(); // Do not jump for link
        } );
    }
    else if( !needToshowButton && div != null )
    {
        div.remove();
    }
}

function ParseBookInfoFromCoverNode( coverNode, id )
{
    let info = new Doujinshi();
    info.id = id;
    if( coverNode == null )
        return null;

    // ParseBookInfoFromCoverNode will fail if called with cover in index page
    let captionNode = coverNode.querySelector( ".caption" );
    if( captionNode == null )
        return null;

    info.name = captionNode.innerText;
    info.image = coverNode.querySelector( "img" ).src;
    info.tags = []; // no for now

    return info;
}

function SetBookCoverState( bookId, coverNode, state, force )
{
    // Auto extract book info from cover
    let bookInfo = ParseBookInfoFromCoverNode( coverNode, bookId );

    chrome.runtime.sendMessage(
        {
            cmd: "setbook",
            id: bookId,
            state: state,
            force: force, // Probably vis selector, override the state
            info: bookInfo
        } );
    DecorateCoverWithState( bookId, coverNode, state ); // Mock local state
}

let g_IndexPageCover = null;
function WriteIndexPageTool( state )
{
    g_IndexPageCover = document.querySelector( "#cover" );

    // This is running for index page cover, which run separately from suggestion cover below the index page
    DecorateCoverWithState( g_IndexPageInfo.bookId, g_IndexPageCover, state ); // Index page cover never use dim
    CreateBookStateSelector( g_IndexPageCover ); // Also add selector for user to override book state
}

function DecorateCoverWithState( bookId, cover, state )
{
    if( cover == null )
        return;

    let useDimEffect = false;
    let modifyImgClassTo = "cover read"; // This is custom class injected by our css

    // Get existing or create new
    let header = cover.querySelector( "#coverStatus" );
    if( header == null )
    {
        header = document.createElement( "div" );
        cover.insertAdjacentElement( 'afterbegin', header ); // Then insert it at the top of cover box
        header.id = "coverStatus";
    }

    if( state === STATE_READ )
    {
        header.className = "coverStatus read";
        header.innerHTML = "READ";
        useDimEffect = true;
    }
    else if( state === STATE_FAV )
    {
        header.className = "coverStatus fav";
        header.innerHTML = "IN FAVORITE";
        useDimEffect = true;
    }
    else if( state === STATE_IGNORE )
    {
        header.className = "coverStatus ignore";
        header.innerHTML = "IGNORED";
        modifyImgClassTo = "cover ignore";
        useDimEffect = true;
    }
    else
    {
        // cover is not needed
        header.remove();
    }

    CreateMarkButtonForCover( cover, state, bookId );

    //// If gallery is already black listed, dont touch its style
    //let coverParent = cover.parentNode;
    //if( coverParent.className.includes( 'blacklisted' ) ) // Likely 'gallery blacklisted'
    //    useDimEffect = false;

    // Hack: Index page will not dim cover
    if( cover === g_IndexPageCover )
        useDimEffect = false;

    let img = cover.getElementsByTagName( 'img' )[0]; // Get img tag inside the cover root, which is cover image itself.
    if( img == null )
        return;

    if( useDimEffect )
    {
        // Modify image node inside not cover root
        // Because it will also modify our "READ" caption (bad)
        img.className = modifyImgClassTo;
    }
    else
    {
        // Restore its original class
        img.className = "lazyload";
    }
}

function CreateBookStateSelector( coverNode )
{
    // Selector always persist at every state
    let selector = coverNode.querySelector( "#stateSelector" );
    if( selector != null )
        return;

    selector = document.createElement( "select" );
    coverNode.insertAdjacentElement( "beforeend", selector ); // As last child
    selector.id = "stateSelector";
    selector.style = "width:80%;";
    selector.innerHTML =
        '<option value="header">NHTracker: Override book state to...</option>' +
        `<option value=${STATE_PEEK}>Unread</option>` +
        `<option value=${STATE_READ}>Read</option>` +
        `<option value=${STATE_IGNORE}>Ignored</option>`;
    selector.addEventListener( 'change', function ()
    {
        let option = this.options[this.selectedIndex].value;
        option = parseInt( option );
        if( Number.isNaN( option ) )
            return;

        SetBookCoverState( g_IndexPageInfo.bookId, coverNode, option, true );
    } );
}

/* Page refocus service //////////////////////////////////////////////*/

let g_CheckPageAndAddRunOnce = false;

window.addEventListener( "focus", OnPageRefocus );
async function OnPageRefocus()
{
    if( !g_CheckPageAndAddRunOnce )
        return;

    console.log( 'focus check, update all book grid again' );
    await AcquireGlobalBookState();
    WriteGridResult( g_BookList, false ); // Rewrite grid result again in case something is updated
}

/* Page init //////////////////////////////////////////////////////////*/

CheckPageAndAdd();

