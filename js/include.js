const STATE_READ = 1;
const STATE_FAV = 2;

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