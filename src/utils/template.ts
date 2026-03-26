export const CELESTIAL_AUTOEXEC_LUA = `-- If you touch this your Mac will explode, do not test me.

task.wait(2)

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

local bridgeFile = "celestial_multiexec.json"
local executedCommandIds = {}
local sessionStart = os.time()

local function readBridge()
    if not isfile(bridgeFile) then
        return { clients = {}, commands = {} }
    end
    local success, data = pcall(function()
        return HttpService:JSONDecode(readfile(bridgeFile))
    end)
    if success and typeof(data) == "table" then
        data.clients = data.clients or {}
        data.commands = data.commands or {}
        return data
    end
    return { clients = {}, commands = {} }
end

local function writeBridge(data)
    pcall(function()
        writefile(bridgeFile, HttpService:JSONEncode(data))
    end)
end

local function registerClient()
    local LocalPlayer = Players.LocalPlayer
    if not LocalPlayer then return end

    local myUserId = tostring(LocalPlayer.UserId)
    local data = readBridge()

    local newClients = {}
    for _, client in ipairs(data.clients) do
        if client.userId ~= myUserId then
            table.insert(newClients, client)
        end
    end

    table.insert(newClients, {
        userId = myUserId,
        username = LocalPlayer.Name,
        displayName = LocalPlayer.DisplayName,
        gameId = game.PlaceId,
        jobId = game.JobId,
        lastHeartbeat = os.time()
    })

    data.clients = newClients
    writeBridge(data)
end

local function heartbeat()
    local LocalPlayer = Players.LocalPlayer
    if not LocalPlayer then return end

    local myUserId = tostring(LocalPlayer.UserId)
    local now = os.time()
    local data = readBridge()

    local activeClients = {}
    local foundSelf = false
    for _, client in ipairs(data.clients) do
        if client.userId == myUserId then
            client.lastHeartbeat = now
            table.insert(activeClients, client)
            foundSelf = true
        elseif client.lastHeartbeat and now - client.lastHeartbeat <= 10 then
            table.insert(activeClients, client)
        end
    end

    if not foundSelf then
        table.insert(activeClients, {
            userId = myUserId,
            username = LocalPlayer.Name,
            displayName = LocalPlayer.DisplayName,
            gameId = game.PlaceId,
            jobId = game.JobId,
            lastHeartbeat = now
        })
    end

    local freshCommands = {}
    for _, cmd in ipairs(data.commands) do
        if cmd.timestamp and now - cmd.timestamp <= 30 then
            table.insert(freshCommands, cmd)
        end
    end

    data.clients = activeClients
    data.commands = freshCommands
    writeBridge(data)
end

local function executeCommands()
    local LocalPlayer = Players.LocalPlayer
    if not LocalPlayer then return end

    local myUserId = tostring(LocalPlayer.UserId)
    local data = readBridge()

    for _, cmd in ipairs(data.commands) do
        if cmd.userId == myUserId and cmd.timestamp and cmd.timestamp >= sessionStart then
            local cmdId = cmd.id or tostring(cmd.timestamp)
            if not executedCommandIds[cmdId] then
                executedCommandIds[cmdId] = true
                pcall(function()
                    loadstring(cmd.script)()
                end)
            end
        end
    end
end

task.spawn(function()
    if not Players.LocalPlayer then
        Players:GetPropertyChangedSignal("LocalPlayer"):Wait()
    end

    task.wait(2)
    registerClient()
    heartbeat()

    task.spawn(function()
        while true do
            heartbeat()
            task.wait(2)
        end
    end)

    while true do
        executeCommands()
        task.wait(0.3)
    end
end)
`;
