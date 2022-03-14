
# WAPPEN's NHentai Tracker Extension
A Chrome extension to help you keep track of read book number.
Display badge over all book covers. Never got lost in search result again!

![Preview](preview/preview.jpg)
![Preview](preview/preview2.png)

### Features
 - Auto mark as READ when you go into any page to read.
 - Or mark them as IGNORED because you want to pass on it.
 - Display them over search result to quickly skim for new book to read.
 - Book read state will sync over browser by chrome sync storage.

### Chrome
![Chrome Store](https://developer.chrome.com/images/meta/favicon-32x32.png) Chrome Store: **Sorry none yet!** It needs to pass some ~~fapping~~ err I mean QA testing first.

### Firefox
I'm never intended to port to FF yet. Soorry! ~~CHECKMATE FF users!~~

------

### Q&A
**Why there are 'READ' and 'IGNORED' state? What's difference**
  - The 'IGNORED' state is used to mark book as **"I peek at it but nah I passed"** rather than **"I read that"**. 
  - Example usage is using IGNORE tag on the book you totally not interested in. 
  - Ignored book will not show in read book listing.
  - Ignored bool will colored differently in search result.
  - (TBD) If there is tag cloud gathering feature in the future, which inspect which tag you read the most, it will ignore tag from ignored books.
  
**I want XX YY ZZ feature! Please make it!! plzzzz**
  - Do it yourself, my dude.

**What is it inspired from?**
- I noticed that browser always mark visited link, like from blue to purple for an eon since internet started, but now in 2022 I have trouble looking at doujin search result, how comes?
- So I searched chrome extension store and github for something like this, hoping that some gentleman would already made it.
- But I found stuff like extension that let you highlight NH number and jump to the site (to save some steps and typing), or the other that when you highlight NH number it will popup and preview the doujin (in fear of stepping into degenerated doujin). 
- I was like WTF this is the best you people can think of??? What The Heck??? Why do you people so serious about those little number?? Just copy paste it and go to the site to check it out like a man!!
- Ok I'm done ranting, that was how this extension was born.

### Credit
- To great myself.
- Took code skeleton from https://github.com/Xwilarg/NHentaiAnalytics thanks!
- Stackoverflow for making me able to go through JavaScript hell after not writing it for 5 years. At least it is better than Java shit.