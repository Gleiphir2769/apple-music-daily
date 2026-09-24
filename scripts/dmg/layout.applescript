on run argv
    set mountPath to item 1 of argv
    -- Resolve filesystem paths before entering Finder's object-specifier scope.
    set imageFolder to (POSIX file mountPath) as alias
    set backgroundFile to (POSIX file (mountPath & "/.background/background.png")) as alias
    tell application "Finder"
        -- Use a concrete Finder window, not the disk's generic container window.
        -- Some Finder versions expose the latter with read-only window properties.
        set createdWindow to make new Finder window
        set windowID to id of createdWindow
        set imageWindow to Finder window id windowID
        set target of imageWindow to imageFolder
        delay 1
        try
            set current view of imageWindow to icon view
            -- Cosmetic properties may be unavailable on some macOS versions.
            try
                set toolbar visible of imageWindow to false
            on error messageText
                log "无法隐藏工具栏，继续设置安装布局：" & messageText
            end try
            try
                set statusbar visible of imageWindow to false
            on error messageText
                log "无法隐藏状态栏，继续设置安装布局：" & messageText
            end try
            set bounds of imageWindow to {100, 100, 820, 562}
            set options to icon view options of imageWindow
            set arrangement of options to not arranged
            set icon size of options to 96
            set text size of options to 13
            set background picture of options to backgroundFile
            set position of item "AppleMusicDaily.app" of (target of imageWindow) to {170, 215}
            set position of item "Applications" of (target of imageWindow) to {550, 215}
            update imageFolder without registering applications
            delay 2
            close imageWindow
        on error messageText number errorNumber
            try
                close imageWindow
            end try
            error messageText number errorNumber
        end try
    end tell
end run
